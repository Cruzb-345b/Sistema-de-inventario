#!/usr/bin/env python3
"""
Hardware Resilient Telemetry Agent
Monitors CPU, RAM, and Disk metrics via psutil.
Shielded with isolated sensor reads and progressive exponential backoff.
"""

import os
import sys
import time
import signal
import logging
from typing import Dict, Any, Optional

try:
    import psutil
except ImportError:
    psutil = None  # Will be handled gracefully in telemetry sensors

try:
    import requests
except ImportError:
    requests = None

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [TelemetryAgent] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("TelemetryAgent")

# Configuration via environment variables with safe fallbacks
DEVICE_ID = os.getenv("AGENT_DEVICE_ID", "edge-node-001")
BACKEND_URL = os.getenv(
    "BACKEND_TELEMETRY_URL",
    f"http://localhost:4000/api/devices/{DEVICE_ID}/telemetry"
)
REPORT_INTERVAL_SECONDS = float(os.getenv("AGENT_REPORT_INTERVAL_SECONDS", "5.0"))
REQUEST_TIMEOUT_SECONDS = float(os.getenv("AGENT_REQUEST_TIMEOUT_SECONDS", "5.0"))
MAX_BACKOFF_SECONDS = 60.0
INITIAL_BACKOFF_SECONDS = 1.0

# Graceful termination control
running = True

def handle_termination_signal(signum, frame):
    global running
    logger.info(f"Received termination signal ({signum}). Initiating graceful agent shutdown...")
    running = False

signal.signal(signal.SIGINT, handle_termination_signal)
signal.signal(signal.SIGTERM, handle_termination_signal)


class TelemetryCollector:
    """
    Collects hardware metrics. Every sensor read is strictly isolated in its
    own try/except block to ensure hardware query failures never crash the thread.
    """

    @staticmethod
    def get_cpu_usage() -> float:
        try:
            if psutil is None:
                return 0.0
            val = psutil.cpu_percent(interval=0.2)
            return round(float(val), 2)
        except Exception as e:
            logger.warning(f"Failed to read CPU sensor: {e}. Defaulting to 0.0%")
            return 0.0

    @staticmethod
    def get_ram_usage() -> float:
        try:
            if psutil is None:
                return 0.0
            mem = psutil.virtual_memory()
            return round(float(mem.percent), 2)
        except Exception as e:
            logger.warning(f"Failed to read RAM sensor: {e}. Defaulting to 0.0%")
            return 0.0

    @staticmethod
    def get_disk_usage() -> float:
        try:
            if psutil is None:
                return 0.0
            # Root path detection compatible with Linux/Unix and Windows
            root_path = "C:\\" if os.name == 'nt' else '/'
            disk = psutil.disk_usage(root_path)
            return round(float(disk.percent), 2)
        except Exception as e:
            logger.warning(f"Failed to read Disk sensor: {e}. Defaulting to 0.0%")
            return 0.0

    @staticmethod
    def get_uptime_seconds() -> float:
        try:
            if psutil is None:
                return 0.0
            boot_time = psutil.boot_time()
            uptime = time.time() - boot_time
            return round(max(0.0, float(uptime)), 1)
        except Exception as e:
            logger.warning(f"Failed to read system uptime: {e}. Defaulting to 0.0s")
            return 0.0

    @staticmethod
    def get_cpu_temperature() -> Optional[float]:
        try:
            if psutil is None or not hasattr(psutil, "sensors_temperatures"):
                return None
            temps = psutil.sensors_temperatures()
            if not temps:
                return None
            for name, entries in temps.items():
                for entry in entries:
                    if entry.current is not None and entry.current > 0:
                        return round(float(entry.current), 1)
            return None
        except Exception:
            return None

    def collect(self) -> Dict[str, Any]:
        """Gathers complete metrics payload safely"""
        payload: Dict[str, Any] = {
            "cpuUsage": self.get_cpu_usage(),
            "ramUsage": self.get_ram_usage(),
            "diskUsage": self.get_disk_usage(),
            "uptimeSeconds": self.get_uptime_seconds(),
        }
        temp = self.get_cpu_temperature()
        if temp is not None:
            payload["temperature"] = temp
        return payload


class ResilientDispatcher:
    """
    Dispatches telemetry payloads to the backend API with exponential backoff
    resilience against timeouts, connection loss, and server outages.
    """

    def __init__(self, endpoint_url: str):
        self.endpoint_url = endpoint_url
        self.current_backoff = INITIAL_BACKOFF_SECONDS

    def dispatch(self, payload: Dict[str, Any]) -> bool:
        if requests is None:
            logger.error("'requests' package is not installed. Unable to dispatch HTTP payload.")
            return False

        try:
            response = requests.post(
                self.endpoint_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ResilientTelemetryAgent/1.0"},
                timeout=REQUEST_TIMEOUT_SECONDS
            )

            # Check HTTP status
            if response.status_code in (200, 201):
                # Reset exponential backoff on success
                if self.current_backoff > INITIAL_BACKOFF_SECONDS:
                    logger.info(f"Connection re-established with backend. Backoff reset to {INITIAL_BACKOFF_SECONDS}s.")
                self.current_backoff = INITIAL_BACKOFF_SECONDS
                logger.info(
                    f"Heartbeat sent [HTTP {response.status_code}] - "
                    f"CPU: {payload['cpuUsage']}% | RAM: {payload['ramUsage']}% | Disk: {payload['diskUsage']}%"
                )
                return True
            else:
                logger.error(
                    f"Backend rejected telemetry [HTTP {response.status_code}]: {response.text[:200]}"
                )
                self._apply_backoff(reason=f"HTTP_{response.status_code}")
                return False

        except requests.exceptions.Timeout:
            logger.error(f"Network Timeout ({REQUEST_TIMEOUT_SECONDS}s) reaching backend at {self.endpoint_url}")
            self._apply_backoff(reason="NETWORK_TIMEOUT")
            return False

        except requests.exceptions.ConnectionError:
            logger.error(f"Connection Refused / Network Unreachable for {self.endpoint_url}")
            self._apply_backoff(reason="CONNECTION_REFUSED")
            return False

        except requests.exceptions.RequestException as e:
            logger.error(f"General Request Exception during dispatch: {e}")
            self._apply_backoff(reason="REQUEST_EXCEPTION")
            return False

        except Exception as e:
            logger.critical(f"Unexpected error in dispatcher: {e}")
            self._apply_backoff(reason="UNKNOWN_DISPATCH_FAILURE")
            return False

    def _apply_backoff(self, reason: str):
        logger.warning(
            f"Entering backoff state ({reason}). Next retry in {self.current_backoff:.1f}s (capped at {MAX_BACKOFF_SECONDS}s)."
        )
        time.sleep(self.current_backoff)
        # Double backoff progressively up to MAX_BACKOFF_SECONDS
        self.current_backoff = min(self.current_backoff * 2.0, MAX_BACKOFF_SECONDS)


def main():
    logger.info("==================================================")
    logger.info("   HARDWARE RESILIENT TELEMETRY AGENT DAEMON      ")
    logger.info("==================================================")
    logger.info(f"Target Device ID : {DEVICE_ID}")
    logger.info(f"Telemetry Endpoint: {BACKEND_URL}")
    logger.info(f"Report Interval  : {REPORT_INTERVAL_SECONDS}s")
    logger.info(f"Max Backoff Cap  : {MAX_BACKOFF_SECONDS}s")
    logger.info("Starting sensor monitoring loop...")

    collector = TelemetryCollector()
    dispatcher = ResilientDispatcher(BACKEND_URL)

    while running:
        payload = collector.collect()
        success = dispatcher.dispatch(payload)

        # Only sleep standard interval if dispatch was successful
        # (if failed, dispatcher already applied progressive backoff sleep)
        if success and running:
            time.sleep(REPORT_INTERVAL_SECONDS)

    logger.info("Telemetry Agent has stopped cleanly. Goodbye.")


if __name__ == "__main__":
    main()
