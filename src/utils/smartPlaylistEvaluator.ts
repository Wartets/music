import { TrackItem } from '../types/music';
import { parseDuration } from './formatters';
import { parseGenres } from './genreUtils';

export type Operator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between';
export type LogicCondition = 'AND' | 'OR';
export interface RuleRangeValue {
    min: string | number;
    max: string | number;
}

export interface SmartRule {
    field: string; // e.g., 'metadata.year', 'audio_specs.is_lossless'
    operator: Operator;
    value: string | number | boolean | RuleRangeValue;
}

export interface RuleGroup {
    condition: LogicCondition;
    rules: (SmartRule | RuleGroup)[];
}

export interface SmartPlaylistDefinition {
    id: string;
    name: string;
    group: RuleGroup;
}

const getFieldValue = (track: TrackItem, path: string): any => {
    let value = path.split('.').reduce((acc, part) => acc && acc[part], track as any);

    // If it's an array (like genre or artists), we usually just want to match against the first one
    // or join them for a 'contains' check. We'll join them.
    if (Array.isArray(value)) {
        return value.join(', ');
    }
    return value;
};

const isRuleRangeValue = (value: SmartRule['value']): value is RuleRangeValue => {
    return typeof value === 'object'
        && value !== null
        && 'min' in value
        && 'max' in value;
};

const parseNumericToken = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value !== 'string') return Number.NaN;

    const normalized = value.trim();
    if (!normalized) return Number.NaN;

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
        return Number(normalized);
    }

    const extracted = normalized.replace(/[^\d.\-]/g, '');
    return extracted ? Number(extracted) : Number.NaN;
};

const toComparableNumber = (field: string, value: unknown): number => {
    if (field === 'audio_specs.duration') {
        if (typeof value === 'number') return value;
        return parseDuration(String(value ?? ''));
    }

    return parseNumericToken(value);
};

const parseRangeValue = (value: SmartRule['value']): RuleRangeValue | null => {
    if (isRuleRangeValue(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const [minRaw, maxRaw] = value.split('..').map(part => part.trim());
        if (minRaw && maxRaw) {
            return { min: minRaw, max: maxRaw };
        }
    }

    return null;
};

const evaluateRule = (track: TrackItem, rule: SmartRule): boolean => {
    const fieldValue = getFieldValue(track, rule.field);

    if (rule.field === 'metadata.genre') {
        const genres = parseGenres(fieldValue);
        const ruleVal = String(rule.value).toLowerCase();

        switch (rule.operator) {
            case 'equals':
                return genres.some(g => g.toLowerCase() === ruleVal);
            case 'contains':
                return genres.some(g => g.toLowerCase().includes(ruleVal));
            case 'startsWith':
                return genres.some(g => g.toLowerCase().startsWith(ruleVal));
            case 'endsWith':
                return genres.some(g => g.toLowerCase().endsWith(ruleVal));
            default:
                return false;
        }
    }

    let fw = fieldValue;
    let rv = rule.value;

    // Type coercion for loose comparisons
    if (typeof fw === 'string' && typeof rv === 'string') {
        fw = String(fw).toLowerCase();
        rv = String(rv).toLowerCase();
    }

    // Handle boolean check if value is string 'true'/'false'
    if (typeof fw === 'boolean' && typeof rv === 'string') {
        rv = rv === 'true';
    }

    if (rule.operator === 'between') {
        const range = parseRangeValue(rule.value);
        if (!range) return false;

        const fieldNumber = toComparableNumber(rule.field, fieldValue);
        const min = toComparableNumber(rule.field, range.min);
        const max = toComparableNumber(rule.field, range.max);

        if (!Number.isFinite(fieldNumber) || !Number.isFinite(min) || !Number.isFinite(max)) {
            return false;
        }

        const low = Math.min(min, max);
        const high = Math.max(min, max);
        return fieldNumber >= low && fieldNumber <= high;
    }

    switch (rule.operator) {
        case 'equals': return fw == rv;
        case 'contains': return typeof fw === 'string' && fw.includes(String(rv));
        case 'startsWith': return typeof fw === 'string' && fw.startsWith(String(rv));
        case 'endsWith': return typeof fw === 'string' && fw.endsWith(String(rv));
        case 'greaterThan': {
            const left = toComparableNumber(rule.field, fw);
            const right = toComparableNumber(rule.field, rv);
            return Number.isFinite(left) && Number.isFinite(right) ? left > right : false;
        }
        case 'lessThan': {
            const left = toComparableNumber(rule.field, fw);
            const right = toComparableNumber(rule.field, rv);
            return Number.isFinite(left) && Number.isFinite(right) ? left < right : false;
        }
        default: return false;
    }
};

export const evaluateRuleGroup = (track: TrackItem, group: RuleGroup): boolean => {
    if (group.rules.length === 0) return true;

    if (group.condition === 'AND') {
        return group.rules.every(ruleOrGroup => {
            if ('condition' in ruleOrGroup) {
                return evaluateRuleGroup(track, ruleOrGroup as RuleGroup);
            } else {
                return evaluateRule(track, ruleOrGroup as SmartRule);
            }
        });
    } else {
        return group.rules.some(ruleOrGroup => {
            if ('condition' in ruleOrGroup) {
                return evaluateRuleGroup(track, ruleOrGroup as RuleGroup);
            } else {
                return evaluateRule(track, ruleOrGroup as SmartRule);
            }
        });
    }
};

export const evaluateSmartPlaylist = (tracks: TrackItem[], config: SmartPlaylistDefinition): TrackItem[] => {
    return tracks.filter(track => evaluateRuleGroup(track, config.group));
};
