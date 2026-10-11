import { Users, FileText, Search } from 'lucide-react';

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-400" />
            <span>Ficha de Clientes & Memoria AI</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Visualiza el Bloc de Notas del Mesero (notes_md), preferencias y direcciones de entrega
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2">
        <Search className="w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar cliente por teléfono, nombre o dirección..."
          className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none placeholder-zinc-500"
        />
      </div>

      <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mx-auto flex items-center justify-center">
          <FileText className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-base font-semibold text-zinc-200">
            Memoria Continua del Cliente
          </h3>
          <p className="text-xs text-zinc-400">
            Cada conversación alimenta el bloque de 4 notas de cada comensal para que el agente recuerde gustos, domicilios y pedidos recurrentes.
          </p>
        </div>
      </div>
    </div>
  );
}
