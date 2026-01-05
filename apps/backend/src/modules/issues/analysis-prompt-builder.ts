import { Injectable } from '@nestjs/common';

import type { IssueAnalysisContext } from './issue-context.service';

/**
 * Builds structured prompts for AI issue analysis
 * Uses the rich context gathered by IssueContextService to create
 * detailed prompts that enable genuinely useful analysis
 */
@Injectable()
export class AnalysisPromptBuilder {
  /**
   * Build the full prompt for initial issue analysis
   */
  buildPrompt(context: IssueAnalysisContext): { system: string; user: string } {
    return {
      system: this.buildSystemPrompt(),
      user: this.buildUserPrompt(context),
    };
  }

  /**
   * Build prompt for a follow-up question
   */
  buildFollowUpPrompt(
    context: IssueAnalysisContext,
    previousAnalysis: string,
    question: string
  ): { system: string; user: string } {
    return {
      system: this.buildSystemPrompt(),
      user: this.buildFollowUpUserPrompt(context, previousAnalysis, question),
    };
  }

  private buildSystemPrompt(): string {
    return `You are an expert log analyst for media server infrastructure (Jellyfin, Sonarr, Radarr, Prowlarr).

Your task is to analyze issues and provide actionable, specific insights based on the provided context data.

CRITICAL RULES:
1. Be SPECIFIC - reference actual data from the context (user counts, timestamps, patterns)
2. Avoid generic advice - your recommendations must be tailored to THIS issue
3. If you're uncertain about root cause, say so with a low confidence score
4. Include practical commands or config changes when applicable

RESPONSE FORMAT (JSON):
{
  "rootCause": {
    "identified": boolean,
    "confidence": 0-100,
    "summary": "One-sentence summary",
    "explanation": "Detailed markdown explanation referencing specific evidence",
    "evidence": ["Evidence point 1 from the data", "Evidence point 2"]
  },
  "impact": {
    "severity": "critical|high|medium|low",
    "summary": "Who/what is affected with specific numbers",
    "usersAffected": number,
    "sessionsAffected": number
  },
  "recommendations": [
    {
      "priority": 1-5,
      "action": "Specific action to take",
      "rationale": "Why this will help based on the evidence",
      "effort": "low|medium|high",
      "commands": ["optional shell/config commands"]
    }
  ],
  "investigation": [
    "Specific step to investigate further",
    "Another investigation step"
  ],
  "additionalNotes": "Optional markdown with extra context or caveats"
}

Return ONLY valid JSON. No markdown code blocks around the JSON.`;
  }

  private buildUserPrompt(ctx: IssueAnalysisContext): string {
    const sections: string[] = [];

    // Issue Details
    sections.push(`## Issue Details
- **Title:** ${ctx.issue.title}
- **Source:** ${ctx.issue.source} (${ctx.server.name}${ctx.server.version ? ` v${ctx.server.version}` : ''})
- **Category:** ${ctx.issue.category || 'uncategorized'}
- **Severity:** ${ctx.issue.severity}
- **Status:** ${ctx.issue.status}
- **Exception Type:** ${ctx.issue.exceptionType || 'none'}
- **First Seen:** ${new Date(ctx.issue.firstSeen).toISOString()}
- **Last Seen:** ${new Date(ctx.issue.lastSeen).toISOString()}
- **Total Occurrences:** ${ctx.issue.occurrenceCount}
- **Impact Score:** ${ctx.issue.impactScore}/100`);

    // Sample Error Messages (varied examples)
    if (ctx.sampleOccurrences.length > 0) {
      sections.push(
        `## Sample Error Messages (${ctx.sampleOccurrences.length} recent occurrences)`
      );

      for (let i = 0; i < Math.min(3, ctx.sampleOccurrences.length); i++) {
        const occ = ctx.sampleOccurrences[i]!;
        sections.push(`
### Occurrence ${i + 1} (${new Date(occ.timestamp).toISOString()})
\`\`\`
${occ.message.substring(0, 1000)}${occ.message.length > 1000 ? '\n... (truncated)' : ''}
\`\`\`
${occ.userId ? `User: ${occ.userId}` : ''}`);
      }
    }

    // Timeline Analysis
    sections.push(`## Timeline Analysis
- **Trend:** ${ctx.timeline.trend}
- **Peak Hours (UTC):** ${ctx.timeline.peakHours.length > 0 ? ctx.timeline.peakHours.map((h) => `${h}:00`).join(', ') : 'No clear pattern'}
- **Burst Detected:** ${ctx.timeline.burstDetected ? 'Yes (3+ occurrences in single hour)' : 'No'}`);

    // Last 24 hours chart
    if (ctx.timeline.hourly.length > 0) {
      const last24h = ctx.timeline.hourly.slice(-24);
      if (last24h.length > 0) {
        sections.push(`\n### Last 24 Hours (hourly)\n${this.formatHourlyChart(last24h)}`);
      }
    }

    // Affected Users
    if (ctx.affectedUsers.length > 0) {
      sections.push(`## Affected Users (${ctx.issue.affectedUsersCount} total)`);
      for (const user of ctx.affectedUsers.slice(0, 5)) {
        const devices = user.devices.length > 0 ? user.devices.join(', ') : 'unknown device';
        sections.push(
          `- **${user.userName || user.userId}**: ${user.occurrenceCount} occurrences, devices: ${devices}`
        );
      }
      if (ctx.affectedUsers.length > 5) {
        sections.push(`- ... and ${ctx.affectedUsers.length - 5} more users`);
      }
    } else {
      sections.push(`## Affected Users\nNo specific users identified.`);
    }

    // Affected Sessions with Playback Context
    if (ctx.affectedSessions.length > 0) {
      sections.push(`## Affected Sessions (${ctx.issue.affectedSessionsCount} total)`);
      for (const session of ctx.affectedSessions.slice(0, 5)) {
        let sessionLine = `- **${session.userName || 'Unknown user'}** on ${session.deviceName || session.clientName || 'unknown device'}`;

        if (session.playbackContext) {
          const pc = session.playbackContext;
          const playbackInfo: string[] = [];
          if (pc.isTranscoding) playbackInfo.push('transcoding');
          else playbackInfo.push('direct play');
          if (pc.videoCodec) playbackInfo.push(`video: ${pc.videoCodec}`);
          if (pc.audioCodec) playbackInfo.push(`audio: ${pc.audioCodec}`);
          if (pc.itemName) playbackInfo.push(`playing: "${pc.itemName}"`);
          if (pc.transcodeReasons && pc.transcodeReasons.length > 0) {
            playbackInfo.push(`transcode reasons: ${pc.transcodeReasons.join(', ')}`);
          }
          sessionLine += ` (${playbackInfo.join(', ')})`;
        }
        sections.push(sessionLine);
      }
    }

    // Stack Traces
    if (ctx.stackTraces.length > 0) {
      sections.push(`## Stack Traces (${ctx.stackTraces.length} unique patterns)`);
      for (const st of ctx.stackTraces.slice(0, 2)) {
        // Truncate very long stack traces
        const truncatedTrace =
          st.trace.length > 1500 ? st.trace.substring(0, 1500) + '\n... (truncated)' : st.trace;

        sections.push(`
### Pattern (${st.count} occurrences)
\`\`\`
${truncatedTrace}
\`\`\``);
      }
    }

    // Final instruction
    sections.push(`
---
Analyze this issue and provide your response in the specified JSON format. Be specific and reference the actual data provided.`);

    return sections.join('\n\n');
  }

  private buildFollowUpUserPrompt(
    ctx: IssueAnalysisContext,
    previousAnalysis: string,
    question: string
  ): string {
    return `## Context

This is a follow-up question about an issue that was previously analyzed.

### Original Issue
- **Title:** ${ctx.issue.title}
- **Source:** ${ctx.issue.source}
- **Category:** ${ctx.issue.category || 'uncategorized'}
- **Occurrences:** ${ctx.issue.occurrenceCount}

### Previous Analysis
${previousAnalysis}

---

## Follow-up Question
${question}

---

Please provide a helpful response in markdown format. You can reference the original analysis and issue context.`;
  }

  /**
   * Format hourly data as a simple ASCII chart
   */
  private formatHourlyChart(hourly: { hour: string; count: number }[]): string {
    const max = Math.max(...hourly.map((h) => h.count), 1);

    return hourly
      .map((h) => {
        const barLength = Math.round((h.count / max) * 20);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        // Extract just the hour part for display
        const hourPart = h.hour.split(' ')[1] || h.hour;
        return `${hourPart}: ${bar} ${h.count}`;
      })
      .join('\n');
  }
}
