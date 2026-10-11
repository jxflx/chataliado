import { CreditCard, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

interface BillingPageProps {
  searchParams: Promise<{
    suspended?: string;
  }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const isSuspended = params.suspended === 'true';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <CreditCard className="w-6 h-6 text-emerald-400" />
          <span>Facturación, Planes y Acceso SaaS</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Gestiona la suscripción mensual de tu restaurante, límites de órdenes y métodos de pago
        </p>
      </div>

      {/* Banner de Suspensión (Si aplica) */}
      {isSuspended && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-300">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-sm">Tu cuenta se encuentra actualmente suspendida</div>
            <p className="text-xs text-red-400/90">
              El servicio automatizado del bot de WhatsApp ha sido pausado. Para reactivar de inmediato la atención con IA y el sistema de pedidos, regulariza tu pago a continuación.
            </p>
          </div>
        </div>
      )}

      {/* Tarjeta de Plan Actual */}
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Plan Activo</div>
            <div className="text-xl font-bold text-white mt-0.5">Plan Pro Restaurante</div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
            {isSuspended ? 'Pago Pendiente' : 'Suscripción Activa'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
            <div className="text-zinc-500">Límite de Pedidos / Mes</div>
            <div className="text-base font-bold text-zinc-200 mt-1">500 pedidos</div>
          </div>
          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
            <div className="text-zinc-500">Periodo de Gracia</div>
            <div className="text-base font-bold text-zinc-200 mt-1">3 días de tolerancia</div>
          </div>
          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
            <div className="text-zinc-500">Métodos de Pago</div>
            <div className="text-base font-bold text-zinc-200 mt-1">Stripe / SPEI Transfer</div>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <button className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer">
            Pagar con Tarjeta (Stripe Checkout)
          </button>
          <button className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition border border-zinc-700 cursor-pointer">
            Registrar Pago por Transferencia SPEI
          </button>
        </div>
      </div>
    </div>
  );
}
