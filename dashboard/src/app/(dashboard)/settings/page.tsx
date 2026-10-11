import { Settings, Cpu, Clock, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-emerald-400" />
          <span>Configuración del Agente IA y Restaurante</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Ajusta las reglas de negocio, prompt de personalidad, horarios y handoffs automáticos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-sm">
            <Cpu className="w-4 h-4" />
            <span>Personalidad y Reglas del Bot</span>
          </div>
          <p className="text-xs text-zinc-400">
            Controla las instrucciones del agente, tiempos de entrega y políticas de venta.
          </p>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-400 font-semibold text-sm">
            <Clock className="w-4 h-4" />
            <span>Horarios de Atención</span>
          </div>
          <p className="text-xs text-zinc-400">
            Define los días y horas en que el restaurante toma pedidos por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
