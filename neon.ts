//escripts de verificacion de conectividad con el servidor en la nube
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declara aquí tus servicios de Neon
  auth: true,
  // Política de rama: ajuste por rama
  branch: (branch) => {
    if (branch.isDefault) {
      // Rama predeterminada: sin modificaciones; utiliza los valores predeterminados del proyecto.
      return {};
    }
    if (!branch.exists) {
      // Nuevas ramas no predeterminadas: caducidad automática
      // Ejecuta `neon checkout <name>` para crear una nueva rama con esta configuración.
      return { ttl: "7d" };
    }
    // Rama existente: sin cambios
    return {};
  },
});
