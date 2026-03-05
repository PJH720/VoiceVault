export type SummaryPromptType = 'incremental' | 'final'

export class PromptService {
  public static incrementalSummary(previousSummary: string, newTranscript: string): string {
    return `You are continuing to summarize an ongoing conversation.

Previous summary:
${previousSummary || '(none)'}

New transcript segment:
${newTranscript}

Update the summary to incorporate new facts only.
Respond ONLY with valid JSON object:
{
  "summary": "2-3 sentence update",
  "actionItems": [],
  "discussionPoints": [],
  "keyStatements": [],
  "decisions": []
}`
  }

  public static finalSummary(transcript: string): string {
    return `Analyze the transcript and generate a structured JSON summary.

Transcript:
${transcript}

Output schema:
{
  "summary": "brief overview",
  "actionItems": [{"task":"", "assignee":"", "deadline":"", "priority":"low|medium|high"}],
  "discussionPoints": ["..."],
  "keyStatements": [{"speaker":"", "text":"", "timestamp":0}],
  "decisions": ["..."]
}

Respond ONLY with JSON.`
  }
}
