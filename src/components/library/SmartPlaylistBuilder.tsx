import React, { useMemo, useRef, useState } from 'react';
import { SmartRule, SmartPlaylistDefinition, Operator, LogicCondition, RuleRangeValue } from '../../utils/smartPlaylistEvaluator';
import { persistenceService } from '../../services/persistence';
import { Plus, Trash2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/I18nContext';
import { TrackItem } from '../../types/music';
import { parseGenres } from '../../utils/genreUtils';

interface SmartPlaylistBuilderProps {
    tracks: TrackItem[];
    onSave?: (playlist: SmartPlaylistDefinition) => void;
    onCancel?: () => void;
}

type FieldDataType = 'text' | 'number' | 'boolean' | 'duration';

interface FieldOption {
    value: string;
    label: TranslationKey;
    dataType: FieldDataType;
}

const FIELD_OPTIONS = [
    { value: 'metadata.title', label: 'smartPlaylist.fields.title', dataType: 'text' },
    { value: 'metadata.artists.0', label: 'smartPlaylist.fields.artist', dataType: 'text' },
    { value: 'metadata.album', label: 'smartPlaylist.fields.album', dataType: 'text' },
    { value: 'metadata.genre', label: 'smartPlaylist.fields.genre', dataType: 'text' },
    { value: 'metadata.tags', label: 'smartPlaylist.fields.customTags', dataType: 'text' },
    { value: 'metadata.year', label: 'smartPlaylist.fields.year', dataType: 'number' },
    { value: 'metadata.bpm', label: 'smartPlaylist.fields.bpm', dataType: 'number' },
    { value: 'audio_specs.codec', label: 'smartPlaylist.fields.codec', dataType: 'text' },
    { value: 'audio_specs.bitrate', label: 'smartPlaylist.fields.bitrate', dataType: 'number' },
    { value: 'audio_specs.duration', label: 'smartPlaylist.fields.duration', dataType: 'duration' },
    { value: 'audio_specs.is_lossless', label: 'smartPlaylist.fields.isLossless', dataType: 'boolean' }
] as const satisfies readonly FieldOption[];

const TEXT_OPERATORS: ReadonlyArray<{ value: Operator; label: TranslationKey }> = [
    { value: 'equals', label: 'smartPlaylist.operators.equals' },
    { value: 'contains', label: 'smartPlaylist.operators.contains' },
    { value: 'startsWith', label: 'smartPlaylist.operators.startsWith' },
    { value: 'endsWith', label: 'smartPlaylist.operators.endsWith' }
];

const NUMBER_OPERATORS: ReadonlyArray<{ value: Operator; label: TranslationKey }> = [
    { value: 'equals', label: 'smartPlaylist.operators.equals' },
    { value: 'greaterThan', label: 'smartPlaylist.operators.greaterThan' },
    { value: 'lessThan', label: 'smartPlaylist.operators.lessThan' },
    { value: 'between', label: 'smartPlaylist.operators.between' }
];

const BOOLEAN_OPERATORS: ReadonlyArray<{ value: Operator; label: TranslationKey }> = [
    { value: 'equals', label: 'smartPlaylist.operators.equals' }
];

const getFieldOption = (field: string): FieldOption => {
    return FIELD_OPTIONS.find(option => option.value === field) || FIELD_OPTIONS[0];
};

const getOperatorOptions = (dataType: FieldDataType): ReadonlyArray<{ value: Operator; label: TranslationKey }> => {
    if (dataType === 'boolean') return BOOLEAN_OPERATORS;
    if (dataType === 'number' || dataType === 'duration') return NUMBER_OPERATORS;
    return TEXT_OPERATORS;
};

const createDefaultRule = (field: string = 'metadata.genre'): SmartRule => {
    const fieldOption = getFieldOption(field);

    if (fieldOption.dataType === 'boolean') {
        return { field, operator: 'equals', value: 'true' };
    }

    if (fieldOption.dataType === 'number') {
        return { field, operator: 'greaterThan', value: '0' };
    }

    if (fieldOption.dataType === 'duration') {
        return { field, operator: 'between', value: { min: '0:30', max: '5:00' } };
    }

    return { field, operator: 'contains', value: '' };
};

const isRangeValue = (value: SmartRule['value']): value is RuleRangeValue => {
    return typeof value === 'object' && value !== null && 'min' in value && 'max' in value;
};

const SUGGESTED_VALUE_FIELDS = new Set([
    'metadata.genre',
    'metadata.artists.0',
    'metadata.album',
    'metadata.tags',
    'audio_specs.codec',
]);

const collectUniqueValues = (values: Array<string | null | undefined>, limit = 100): string[] => {
    const seen = new Set<string>();
    const collected: string[] = [];

    for (const raw of values) {
        const value = String(raw ?? '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(value);
        if (collected.length >= limit) break;
    }

    return collected.sort((a, b) => a.localeCompare(b));
};

export const SmartPlaylistBuilder: React.FC<SmartPlaylistBuilderProps> = ({ tracks, onSave, onCancel }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('New Smart Playlist');
    const [condition, setCondition] = useState<LogicCondition>('AND');
    const [rules, setRules] = useState<SmartRule[]>([createDefaultRule('metadata.year')]);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const { containerRef, handleKeyDown } = useFocusTrap<HTMLDivElement>({
        active: true,
        onEscape: onCancel,
        initialFocusRef: titleInputRef,
    });

    const valueSuggestions = useMemo(() => {
        const genreValues: string[] = [];
        const artistValues: string[] = [];
        const albumValues: string[] = [];
        const tagValues: string[] = [];
        const codecValues: string[] = [];

        tracks.forEach(track => {
            parseGenres(track.metadata?.genre).forEach(genre => genreValues.push(genre));
            (track.metadata?.artists || []).forEach(artist => artistValues.push(artist));

            if (track.metadata?.album) albumValues.push(track.metadata.album);
            if (track.metadata?.tags) track.metadata.tags.forEach(tag => tagValues.push(tag));
            if (track.audio_specs?.codec) codecValues.push(track.audio_specs.codec);
        });

        return {
            'metadata.genre': collectUniqueValues(genreValues),
            'metadata.artists.0': collectUniqueValues(artistValues),
            'metadata.album': collectUniqueValues(albumValues),
            'metadata.tags': collectUniqueValues(tagValues),
            'audio_specs.codec': collectUniqueValues(codecValues),
        } as const;
    }, [tracks]);

    const logicOptions = [
        { value: 'AND' as const, label: t('smartPlaylist.matchAll') },
        { value: 'OR' as const, label: t('smartPlaylist.matchAny') },
    ];

    const handleAddRule = () => {
        setRules([...rules, createDefaultRule()]);
    };

    const handleRemoveRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const handleChangeRule = (index: number, changes: Partial<SmartRule>) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], ...changes };
        setRules(newRules);
    };

    const handleFieldChange = (index: number, field: string) => {
        const baseRule = createDefaultRule(field);
        const currentRule = rules[index];
        const newRules = [...rules];

        newRules[index] = {
            ...baseRule,
            value: currentRule?.value ?? baseRule.value
        };

        const operatorOptions = getOperatorOptions(getFieldOption(field).dataType).map(option => option.value);
        if (!operatorOptions.includes(currentRule.operator)) {
            newRules[index].operator = baseRule.operator;
            newRules[index].value = baseRule.value;
        }

        setRules(newRules);
    };

    const handleOperatorChange = (index: number, operator: Operator) => {
        const currentRule = rules[index];
        const fieldOption = getFieldOption(currentRule.field);

        if (operator === 'between') {
            const existingRange = isRangeValue(currentRule.value)
                ? currentRule.value
                : {
                    min: fieldOption.dataType === 'duration' ? '0:30' : '0',
                    max: fieldOption.dataType === 'duration' ? '5:00' : '120'
                };

            handleChangeRule(index, { operator, value: existingRange });
            return;
        }

        if (fieldOption.dataType === 'boolean') {
            handleChangeRule(index, { operator, value: String(currentRule.value ?? 'true') === 'true' ? 'true' : 'false' });
            return;
        }

        handleChangeRule(index, {
            operator,
            value: isRangeValue(currentRule.value) ? String(currentRule.value.min ?? '') : String(currentRule.value ?? '')
        });
    };

    const handleRangeChange = (index: number, part: 'min' | 'max', value: string) => {
        const currentRule = rules[index];
        const currentRange = isRangeValue(currentRule.value) ? currentRule.value : { min: '', max: '' };
        handleChangeRule(index, {
            value: {
                ...currentRange,
                [part]: value
            }
        });
    };

    const handleSave = () => {
        const def: SmartPlaylistDefinition = {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
            name,
            group: {
                condition,
                rules
            }
        };

        persistenceService.saveSmartPlaylist(def);
        if (onSave) onSave(def);
    };

    return (
        <div
            ref={containerRef}
            className="w-[min(100%,56rem)] max-w-full bg-[#1a1a1a] text-white rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-y-auto custom-scrollbar shadow-2xl border border-white/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-playlist-builder-title"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
        >
            <div className="mb-4 sm:mb-6">
                <h2 id="smart-playlist-builder-title" className="text-xl sm:text-2xl font-black mt-0">
                    {t('smartPlaylist.title')}
                </h2>
            </div>

            <div className="mb-4 sm:mb-5">
                <label className="block text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                    {t('smartPlaylist.playlistName')}
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-white placeholder:text-gray-500 outline-none focus:border-dominant min-h-12"
                    placeholder={t('smartPlaylist.namePlaceholder')}
                />
            </div>

            <div className="mb-4 sm:mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-gray-400 font-bold">{t('smartPlaylist.matchLabel')}</span>
                <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
                    {logicOptions.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setCondition(option.value)}
                            aria-pressed={condition === option.value}
                            className={`px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${
                                condition === option.value
                                    ? 'bg-dominant text-on-dominant shadow-lg'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <span className="text-xs sm:text-sm text-gray-400 font-bold">{t('smartPlaylist.ofFollowingRules')}</span>
            </div>

            <div className="flex flex-col gap-3 mb-5 sm:mb-6 bg-white/5 rounded-xl border border-white/5 p-3 sm:p-4">
                {rules.map((rule, idx) => (
                    <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                        {(() => {
                            const fieldOption = getFieldOption(rule.field);
                            const operatorOptions = getOperatorOptions(fieldOption.dataType);
                            const isRangeOperator = rule.operator === 'between';
                            const currentRange = isRangeValue(rule.value) ? rule.value : { min: '', max: '' };
                            const inputType = fieldOption.dataType === 'number' ? 'number' : 'text';
                            const singleValue = isRangeValue(rule.value) ? String(rule.value.min ?? '') : String(rule.value ?? '');
                            const suggestions = SUGGESTED_VALUE_FIELDS.has(rule.field) ? valueSuggestions[rule.field as keyof typeof valueSuggestions] || [] : [];
                            const suggestionId = `smart-playlist-values-${idx}`;

                            return (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] gap-2 sm:gap-3 items-start">
                                        <select
                                            value={rule.field}
                                            onChange={(e) => handleFieldChange(idx, e.target.value)}
                                            className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-dominant min-h-11"
                                        >
                                            {FIELD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{t(opt.label)}</option>)}
                                        </select>

                                        <select
                                            value={rule.operator}
                                            onChange={(e) => handleOperatorChange(idx, e.target.value as Operator)}
                                            className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-dominant min-h-11"
                                        >
                                            {operatorOptions.map(opt => <option key={opt.value} value={opt.value}>{t(opt.label)}</option>)}
                                        </select>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveRule(idx)}
                                            className="justify-self-start lg:justify-self-end p-2.5 sm:p-2 min-h-11 min-w-11 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                            aria-label={t('common.remove')}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="mt-2 grid grid-cols-1 gap-2">
                                        {fieldOption.dataType === 'boolean' ? (
                                            <select
                                                value={String(rule.value ?? 'true') === 'true' ? 'true' : 'false'}
                                                onChange={(e) => handleChangeRule(idx, { value: e.target.value })}
                                                className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-dominant min-h-11"
                                            >
                                                <option value="true">{t('smartPlaylist.operators.true')}</option>
                                                <option value="false">{t('smartPlaylist.operators.false')}</option>
                                            </select>
                                        ) : isRangeOperator ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                <input
                                                    type={inputType}
                                                    value={String(currentRange.min ?? '')}
                                                    onChange={(e) => handleRangeChange(idx, 'min', e.target.value)}
                                                    className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white placeholder:text-gray-500 outline-none focus:border-dominant min-h-11"
                                                    placeholder={fieldOption.dataType === 'duration' ? t('smartPlaylist.minDuration') : t('common.min')}
                                                />
                                                <input
                                                    type={inputType}
                                                    value={String(currentRange.max ?? '')}
                                                    onChange={(e) => handleRangeChange(idx, 'max', e.target.value)}
                                                    className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white placeholder:text-gray-500 outline-none focus:border-dominant min-h-11"
                                                    placeholder={fieldOption.dataType === 'duration' ? t('smartPlaylist.maxDuration') : t('common.max')}
                                                />
                                            </div>
                                        ) : suggestions.length > 0 ? (
                                            <>
                                                <input
                                                    type={inputType}
                                                    list={suggestionId}
                                                    value={singleValue}
                                                    onChange={(e) => handleChangeRule(idx, { value: e.target.value })}
                                                    className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white placeholder:text-gray-500 outline-none focus:border-dominant min-h-11"
                                                    placeholder={fieldOption.dataType === 'duration' ? t('smartPlaylist.fields.duration') : t('common.value')}
                                                />
                                                <datalist id={suggestionId}>
                                                    {suggestions.map(option => (
                                                        <option key={option} value={option} />
                                                    ))}
                                                </datalist>
                                            </>
                                        ) : (
                                            <input
                                                type={inputType}
                                                value={singleValue}
                                                onChange={(e) => handleChangeRule(idx, { value: e.target.value })}
                                                className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white placeholder:text-gray-500 outline-none focus:border-dominant min-h-11"
                                                placeholder={fieldOption.dataType === 'duration' ? t('smartPlaylist.fields.duration') : t('common.value')}
                                            />
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                ))}

                <button
                    type="button"
                    onClick={handleAddRule}
                    className="w-full py-2.5 min-h-11 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-gray-400 hover:text-white border border-dashed border-white/20 hover:border-dominant rounded-xl transition-colors"
                >
                    <Plus size={16} /> {t('smartPlaylist.addRule')}
                </button>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                <button 
                    type="button"
                    onClick={onCancel} 
                    className="px-5 py-3 min-h-12 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                    {t('smartPlaylist.cancel')}
                </button>
                <button 
                    type="button"
                    onClick={handleSave} 
                    className="px-5 py-3 min-h-12 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest bg-green-500 text-black hover:bg-green-400 transition-colors"
                >
                    {t('smartPlaylist.savePlaylist')}
                </button>
            </div>
        </div>
    );
};
