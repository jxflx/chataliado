'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Sliders,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles as _Sparkles, // prohibited, ensure not used
} from 'lucide-react';
import {
  optionsSchema,
  optionGroupSchema,
  type OptionGroup,
  type OptionChoice,
} from '@/schemas/menu';

export interface OptionsSchemaBuilderProps {
  value: OptionGroup[];
  onChange: (value: OptionGroup[]) => void;
  disabled?: boolean;
}

export function OptionsSchemaBuilder({
  value = [],
  onChange,
  disabled = false,
}: OptionsSchemaBuilderProps) {
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});

  // Validación en tiempo real con Zod
  const validationResult = optionsSchema.safeParse(value);
  const groupErrors: Record<number, string[]> = {};

  if (!validationResult.success) {
    validationResult.error.issues.forEach((issue) => {
      const groupIdx = issue.path[0];
      if (typeof groupIdx === 'number') {
        if (!groupErrors[groupIdx]) groupErrors[groupIdx] = [];
        groupErrors[groupIdx].push(issue.message);
      }
    });
  }

  const toggleCollapse = (idx: number) => {
    setCollapsedGroups((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleAddGroup = () => {
    const newGroup: OptionGroup = {
      name: '',
      type: 'single_choice',
      required: false,
      choices: [{ label: '', price_modifier: 0 }],
    };
    onChange([...value, newGroup]);
  };

  const handleRemoveGroup = (index: number) => {
    const updated = value.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleUpdateGroup = (index: number, updates: Partial<OptionGroup>) => {
    const updated = value.map((group, i) => {
      if (i !== index) return group;
      return { ...group, ...updates };
    });
    onChange(updated);
  };

  const handleAddChoice = (groupIndex: number) => {
    const group = value[groupIndex];
    if (!group) return;
    const newChoice: OptionChoice = { label: '', price_modifier: 0 };
    handleUpdateGroup(groupIndex, {
      choices: [...group.choices, newChoice],
    });
  };

  const handleRemoveChoice = (groupIndex: number, choiceIndex: number) => {
    const group = value[groupIndex];
    if (!group) return;
    handleUpdateGroup(groupIndex, {
      choices: group.choices.filter((_, i) => i !== choiceIndex),
    });
  };

  const handleUpdateChoice = (
    groupIndex: number,
    choiceIndex: number,
    field: 'label' | 'price_modifier',
    val: string | number
  ) => {
    const group = value[groupIndex];
    if (!group) return;
    const updatedChoices = group.choices.map((choice, i) => {
      if (i !== choiceIndex) return choice;
      return {
        ...choice,
        [field]: field === 'price_modifier' ? (typeof val === 'number' ? val : parseFloat(val) || 0) : val,
      };
    });
    handleUpdateGroup(groupIndex, { choices: updatedChoices });
  };

  return (
    <div className="space-y-4">
      {/* Encabezado del constructor de modificadores */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-jade" />
          <span className="text-xs font-bold text-ink-primary tracking-tight">
            {`Modificadores & Opciones (${value.length})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="text-[11px] font-semibold text-ink-secondary hover:text-ink-primary px-2.5 py-1 rounded-lg bg-white/60 hover:bg-white border border-border-whisper pressable shadow-2xs"
          >
            {showPreview ? 'Ocultar Vista Previa' : 'Ver Vista Previa'}
          </button>
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 rounded-xl pressable shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Grupo</span>
          </button>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="p-5 text-center rounded-2xl border border-dashed border-border-strong/70 bg-white/40">
          <Layers className="w-6 h-6 text-ink-tertiary mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-ink-secondary">
            Este platillo no tiene modificadores ni grupos de opciones
          </p>
          <p className="text-[11px] text-ink-tertiary mt-0.5 max-w-sm mx-auto">
            Agrega grupos si el platillo requiere tamaños, ingredientes extra o selecciones personalizadas.
          </p>
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={disabled}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-jade bg-jade-subtle hover:bg-jade-subtle/80 px-3 py-1.5 rounded-xl pressable"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Primer Grupo</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((group, gIdx) => {
            const isCollapsed = !!collapsedGroups[gIdx];
            const errors = groupErrors[gIdx] || [];
            const hasError = errors.length > 0;

            return (
              <div
                key={gIdx}
                className={`rounded-2xl border transition-all ${
                  hasError
                    ? 'border-alert-crimson/50 bg-alert-crimson-subtle/20'
                    : 'border-white/90 bg-white/80 shadow-2xs'
                }`}
              >
                {/* Cabecera del grupo */}
                <div className="p-3.5 flex items-center justify-between gap-3 border-b border-border-whisper/60">
                  <div className="flex-1 flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(gIdx)}
                      className="text-ink-tertiary hover:text-ink-primary p-1 rounded-md"
                      aria-label="Alternar grupo"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Nombre del grupo (ej. Tamaño, Término de Carne)"
                        value={group.name}
                        onChange={(e) => handleUpdateGroup(gIdx, { name: e.target.value })}
                        disabled={disabled}
                        className="w-full text-xs font-bold text-ink-primary bg-transparent focus:outline-none placeholder:text-ink-tertiary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Selector de Tipo (Radio vs Checkbox) */}
                    <select
                      value={group.type}
                      onChange={(e) =>
                        handleUpdateGroup(gIdx, {
                          type: e.target.value as 'single_choice' | 'multiple_choice',
                        })
                      }
                      disabled={disabled}
                      className="text-[11px] font-semibold text-ink-secondary bg-white/90 border border-border-whisper rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-jade"
                    >
                      <option value="single_choice">Una sola opción (Radio)</option>
                      <option value="multiple_choice">Múltiples opciones (Checkbox)</option>
                    </select>

                    {/* Toggle Requerido */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-ink-secondary select-none px-2 py-1 rounded-lg bg-white/70 border border-border-whisper">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(e) => handleUpdateGroup(gIdx, { required: e.target.checked })}
                        disabled={disabled}
                        className="w-3.5 h-3.5 text-jade rounded focus:ring-0 border-border-strong cursor-pointer"
                      />
                      <span>Obligatorio</span>
                    </label>

                    {/* Eliminar Grupo */}
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(gIdx)}
                      disabled={disabled}
                      title="Eliminar grupo"
                      className="text-ink-tertiary hover:text-alert-crimson p-1 rounded-md pressable"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Contenido expandible del grupo */}
                {!isCollapsed && (
                  <div className="p-3.5 space-y-3">
                    {/* Lista de opciones / variantes */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary px-1">
                        <div className="col-span-7">Nombre de la Opción</div>
                        <div className="col-span-4 text-right">Modificador (+ MXN)</div>
                        <div className="col-span-1"></div>
                      </div>

                      {group.choices.map((choice, cIdx) => (
                        <div key={cIdx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-7">
                            <input
                              type="text"
                              placeholder="ej. Mediana 30cm, Queso Extra"
                              value={choice.label}
                              onChange={(e) =>
                                handleUpdateChoice(gIdx, cIdx, 'label', e.target.value)
                              }
                              disabled={disabled}
                              className="w-full text-xs text-ink-primary bg-white/90 border border-border-whisper rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary"
                            />
                          </div>
                          <div className="col-span-4 relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-mono text-ink-tertiary">
                              +$
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              placeholder="0.00"
                              value={choice.price_modifier === 0 ? '' : choice.price_modifier}
                              onChange={(e) =>
                                handleUpdateChoice(gIdx, cIdx, 'price_modifier', e.target.value)
                              }
                              disabled={disabled}
                              className="w-full text-xs font-mono font-semibold text-right text-ink-primary bg-white/90 border border-border-whisper rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary"
                            />
                          </div>
                          <div className="col-span-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveChoice(gIdx, cIdx)}
                              disabled={disabled || group.choices.length <= 1}
                              title="Eliminar opción"
                              className="text-ink-tertiary hover:text-alert-crimson disabled:opacity-30 p-1 rounded pressable"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Botón agregar opción dentro del grupo */}
                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleAddChoice(gIdx)}
                        disabled={disabled}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-jade hover:text-jade-hover pressable"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Agregar opción a este grupo</span>
                      </button>

                      {hasError && (
                        <div className="flex items-center gap-1 text-[11px] text-alert-crimson font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{errors[0]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Vista Previa Interactiva Estructurada */}
      {showPreview && value.length > 0 && (
        <div className="mt-4 p-4 rounded-2xl bg-white/60 border border-border-whisper space-y-3">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-jade" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
              Vista Previa para el Cliente (Simulación Bot / WhatsApp)
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {value.map((group, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white/80 border border-border-whisper/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-primary">
                    {group.name || `Grupo #${idx + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {group.required ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-alert-ochre-subtle text-alert-ochre border border-alert-ochre/20">
                        Obligatorio
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-tertiary font-medium">
                        Opcional
                      </span>
                    )}
                    <span className="text-[10px] text-ink-secondary px-1.5 py-0.5 rounded bg-surface-subtle border border-border-whisper">
                      {group.type === 'single_choice' ? '1 opción' : 'Múltiples'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.choices.map((choice, cIdx) => (
                    <div
                      key={cIdx}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle/70 border border-border-whisper text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-3 h-3 rounded-${
                            group.type === 'single_choice' ? 'full' : 'sm'
                          } border border-border-strong flex-shrink-0`}
                        />
                        <span className="truncate text-ink-primary font-medium">
                          {choice.label || `Opción ${cIdx + 1}`}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-ink-secondary flex-shrink-0 ml-2">
                        {choice.price_modifier > 0
                          ? `+$${choice.price_modifier.toFixed(2)}`
                          : '$0.00'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
