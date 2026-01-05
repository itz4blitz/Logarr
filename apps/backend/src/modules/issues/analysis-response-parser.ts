import { Logger } from '@nestjs/common';

import type { StructuredAnalysis, Recommendation } from './analysis-response.types';

const logger = new Logger('AnalysisResponseParser');

/**
 * Parse and validate AI analysis response
 * Handles both clean JSON and JSON embedded in markdown
 */
export function parseAnalysisResponse(raw: string): StructuredAnalysis {
  // Try to extract JSON from the response
  const jsonContent = extractJSON(raw);

  if (!jsonContent) {
    logger.warn('Could not extract JSON from AI response, using fallback parser');
    return createFallbackAnalysis(raw);
  }

  try {
    const parsed = JSON.parse(jsonContent);
    return validateAndNormalize(parsed);
  } catch (error) {
    logger.warn(`JSON parse failed: ${error}, using fallback parser`);
    return createFallbackAnalysis(raw);
  }
}

/**
 * Extract JSON from response, handling various formats
 */
function extractJSON(raw: string): string | null {
  // Try direct parse first
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1];
  }

  // Try to find first complete JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    // Validate it's actually complete JSON by trying to parse
    try {
      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch {
      // Not valid JSON, continue
    }
  }

  return null;
}

/**
 * Validate and normalize parsed JSON to ensure it matches our schema
 */
function validateAndNormalize(obj: unknown): StructuredAnalysis {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Response is not an object');
  }

  const data = obj as Record<string, unknown>;

  const result: StructuredAnalysis = {
    rootCause: normalizeRootCause(data['rootCause']),
    impact: normalizeImpact(data['impact']),
    recommendations: normalizeRecommendations(data['recommendations']),
    investigation: normalizeInvestigation(data['investigation']),
  };

  if (typeof data['additionalNotes'] === 'string' && data['additionalNotes'].trim().length > 0) {
    result.additionalNotes = data['additionalNotes'];
  }

  return result;
}

function normalizeRootCause(raw: unknown): StructuredAnalysis['rootCause'] {
  const defaults: StructuredAnalysis['rootCause'] = {
    identified: false,
    confidence: 50,
    summary: 'Unable to determine root cause',
    explanation: 'The AI was unable to provide a structured analysis.',
    evidence: [],
  };

  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const data = raw as Record<string, unknown>;

  return {
    identified: typeof data['identified'] === 'boolean' ? data['identified'] : !!data['summary'],
    confidence: clamp(toNumber(data['confidence'], 50), 0, 100),
    summary: toString(data['summary'], defaults.summary),
    explanation: toString(data['explanation'], defaults.explanation),
    evidence: toStringArray(data['evidence']),
  };
}

function normalizeImpact(raw: unknown): StructuredAnalysis['impact'] {
  const defaults: StructuredAnalysis['impact'] = {
    severity: 'medium',
    summary: 'Impact could not be determined',
    usersAffected: 0,
    sessionsAffected: 0,
  };

  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const data = raw as Record<string, unknown>;
  const validSeverities = ['critical', 'high', 'medium', 'low'] as const;
  const rawSeverity = toString(data['severity'], 'medium').toLowerCase();
  const severity = validSeverities.includes(rawSeverity as (typeof validSeverities)[number])
    ? (rawSeverity as (typeof validSeverities)[number])
    : 'medium';

  return {
    severity,
    summary: toString(data['summary'], defaults.summary),
    usersAffected: Math.max(0, toNumber(data['usersAffected'], 0)),
    sessionsAffected: Math.max(0, toNumber(data['sessionsAffected'], 0)),
  };
}

function normalizeRecommendations(raw: unknown): Recommendation[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item, index) => normalizeRecommendation(item, index + 1))
    .sort((a, b) => a.priority - b.priority);
}

function normalizeRecommendation(
  raw: Record<string, unknown>,
  defaultPriority: number
): Recommendation {
  const validEfforts = ['low', 'medium', 'high'] as const;
  const rawEffort = toString(raw['effort'], 'medium').toLowerCase();
  const effort = validEfforts.includes(rawEffort as (typeof validEfforts)[number])
    ? (rawEffort as (typeof validEfforts)[number])
    : 'medium';

  const result: Recommendation = {
    priority: clamp(toNumber(raw['priority'], defaultPriority), 1, 5),
    action: toString(raw['action'], 'Review the issue'),
    rationale: toString(raw['rationale'], 'No rationale provided'),
    effort,
  };

  const commands = toStringArray(raw['commands']);
  if (commands.length > 0) {
    result.commands = commands;
  }

  return result;
}

function normalizeInvestigation(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

/**
 * Create a fallback analysis when JSON parsing fails completely
 * Attempts to extract useful information from raw text
 */
function createFallbackAnalysis(raw: string): StructuredAnalysis {
  logger.warn('Creating fallback analysis from raw text');

  // Try to extract some meaning from the raw text
  const lines = raw.split('\n').filter((l) => l.trim());

  // Look for common patterns
  const hasCritical = /critical|urgent|immediate/i.test(raw);
  const hasHigh = /high|severe|important/i.test(raw);

  let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  if (hasCritical) severity = 'critical';
  else if (hasHigh) severity = 'high';

  return {
    rootCause: {
      identified: false,
      confidence: 30,
      summary: 'Analysis returned unstructured response',
      explanation: `The AI analysis could not be parsed as structured data. Raw response:\n\n${raw.substring(0, 2000)}${raw.length > 2000 ? '\n\n...(truncated)' : ''}`,
      evidence: [],
    },
    impact: {
      severity,
      summary: 'Could not determine impact from unstructured response',
      usersAffected: 0,
      sessionsAffected: 0,
    },
    recommendations: [
      {
        priority: 1,
        action: 'Review the raw analysis output',
        rationale: 'The AI response could not be parsed into structured recommendations',
        effort: 'low',
      },
    ],
    investigation: lines.slice(0, 5).map((l) => l.substring(0, 200)),
    additionalNotes:
      'This analysis was created from an unstructured AI response. Please review the explanation field for the raw output.',
  };
}

// Utility functions
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

function toString(value: unknown, defaultValue: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return defaultValue;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}
