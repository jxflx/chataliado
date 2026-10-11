import { loginWithPassword } from '../actions';

interface LoginPageProps {
  searchParams: Promise<{
    redirectTo?: string;
    error?: string;
    suspended?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = params.redirectTo || '/';
  const errorCode = params.error;
  const isSuspended = params.suspended === 'true';

  let errorMessage: string | null = null;
  if (errorCode === 'invalid_credentials') {
    errorMessage = 'Credenciales inválidas. Verifica tu correo y contraseña.';
  } else if (errorCode === 'missing_credentials') {
    errorMessage = 'Por favor ingresa tanto tu correo como tu contraseña.';
  } else if (errorCode) {
    errorMessage = 'No se pudo iniciar sesión. Intenta nuevamente.';
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          ChatAliado
        </h1>
        <p className="text-sm text-zinc-400">
          Inicia sesión para gestionar tus pedidos, cocina y WhatsApp
        </p>
      </div>

      {/* Alertas */}
      {isSuspended && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
          Tu cuenta requiere regularización de pago para acceder al servicio.
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Formulario de Login */}
      <form action={loginWithPassword} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-300"
          >
            Correo Electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="dueño@pizzeria.com"
            className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-300"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition duration-150 shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Entrar al Dashboard</span>
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
        </button>
      </form>

      {/* Footer Info */}
      <div className="pt-2 text-center text-xs text-zinc-500">
        Plataforma SaaS Multi-Tenant protegida con Supabase RLS y Workers
      </div>
    </div>
  );
}
