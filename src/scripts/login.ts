// src/scripts/login.ts - Lógica cliente del módulo de autenticación y login
import { supabase } from "@lib/supabase";
import { SESSION_STORAGE_KEY, SESSION_COOKIE_KEY } from "@lib/constants";
import { logSystemActivity } from "@lib/audit";

export function initLogin(): void {

  const form = document.getElementById("form-login") as HTMLFormElement;
  const emailInput = document.getElementById("login-email") as HTMLInputElement;
  const passwordInput = document.getElementById(
    "login-password",
  ) as HTMLInputElement;
  const rememberCheckbox = document.getElementById(
    "remember-me",
  ) as HTMLInputElement;
  const submitBtn = document.getElementById(
    "btn-submit-login",
  ) as HTMLButtonElement;
  const btnText = document.getElementById("btn-login-text") as HTMLElement;
  const btnSpinner = document.getElementById(
    "btn-login-spinner",
  ) as HTMLElement;
  const alertBox = document.getElementById("login-alert-box") as HTMLElement;
  const alertText = document.getElementById("login-alert-text") as HTMLElement;

  // Toggle visibilidad de contraseña
  const togglePassBtn = document.getElementById("btn-toggle-password");
  const eyeOpen = document.getElementById("eye-icon-open");
  const eyeClosed = document.getElementById("eye-icon-closed");

  if (togglePassBtn && passwordInput && eyeOpen && eyeClosed) {
    togglePassBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      eyeOpen.style.display = isPassword ? "none" : "block";
      eyeClosed.style.display = isPassword ? "block" : "none";
      togglePassBtn.setAttribute(
        "title",
        isPassword ? "Ocultar contraseña" : "Mostrar contraseña",
      );
    });
  }

  function showAlert(msg: string) {
    if (alertBox && alertText) {
      alertText.textContent = msg;
      alertBox.style.display = "flex";
    }
  }

  function hideAlert() {
    if (alertBox) {
      alertBox.style.display = "none";
    }
  }

  function setLoading(loading: boolean) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (loading) {
      if (btnText) btnText.textContent = "Verificando credenciales...";
      if (btnSpinner) btnSpinner.style.display = "block";
    } else {
      if (btnText) btnText.textContent = "Iniciar Sesión Institucional";
      if (btnSpinner) btnSpinner.style.display = "none";
    }
  }

  // Manejo del Submit del Login Institucional
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const email = emailInput?.value.trim().toLowerCase() || "";
    const password = passwordInput?.value || "";
    const remember = rememberCheckbox?.checked ?? true;

    if (!email || !password) {
      showAlert(
        "Por favor ingrese tanto el correo institucional como la contraseña.",
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Autenticación oficial y cifrada con Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError || !authData.user) {
        console.warn("Error de autenticación Supabase:", authError);
        const msg =
          authError?.message === "Invalid login credentials"
            ? "Credenciales incorrectas. Verifique su correo institucional y contraseña."
            : authError?.message ||
              "No se pudo iniciar sesión. Verifique sus credenciales.";
        showAlert(msg);
        setLoading(false);
        return;
      }

      // 2. Consultar perfil institucional del usuario en Supabase PostgreSQL
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .or(`email.eq.${email},id.eq.${authData.user.id}`)
        .maybeSingle();

      const fullName =
        profile?.full_name ||
        authData.user.user_metadata?.full_name ||
        "Funcionario Institucional";
      const roleCode =
        profile?.role || authData.user.user_metadata?.role || "funcionario";
      const isAdmin = roleCode === "admin";
      const userId = profile?.id || "usr-root";

      const sessionUser = {
        id: userId,
        authId: authData.user.id,
        name: fullName,
        email: email,
        role: isAdmin ? "Administrador" : "Funcionario",
        roleId: roleCode,
        initials:
          fullName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase() || "FN",
        avatarColor: isAdmin ? "#006837" : "#D4AF37",
        avatar_url: profile?.avatar_url || null,
        avatarUrl: profile?.avatar_url || null,
      };

      // 3. Persistir sesión en localStorage y cookies del middleware
      localStorage.setItem("sgd_current_user", JSON.stringify(sessionUser));
      const sessionPayload = {
        userId: sessionUser.id,
        email: sessionUser.email,
        loggedAt: new Date().toISOString(),
      };

      if (remember) {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(sessionPayload),
        );
      } else {
        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(sessionPayload),
        );
      }

      // Cookie de sesión que verifica el middleware (max-age 7 días si remember, o 1 día)
      const maxAge = remember ? 7 * 24 * 3600 : 24 * 3600;
      document.cookie = `${SESSION_COOKIE_KEY}=${sessionUser.id}; path=/; max-age=${maxAge}; SameSite=Lax`;

      // 4. Registro oficial de trazabilidad en la bitácora inmutable de auditoría
      try {
        await logSystemActivity({
          actor: sessionUser,
          action: "Inicio de Sesión Exitoso",
          actionType: "ACCESO",
          entity: "Control de Acceso Institucional",
          entityId: sessionUser.id,
          details: `El usuario ${sessionUser.name} (${sessionUser.email}) inició sesión con credenciales institucionales verificadas en Supabase Auth.`,
          severity: "INFO",
        });
      } catch (auditErr) {
        console.warn(
          "Registro de auditoría completado en segundo plano:",
          auditErr,
        );
      }

      // 5. Redirección inmediata al Dashboard Institucional
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error("Error general durante el login:", err);
      showAlert(
        err.message ||
          "Ocurrió un error inesperado al conectar con el servidor de autenticación.",
      );
      setLoading(false);
    }
  });
}
