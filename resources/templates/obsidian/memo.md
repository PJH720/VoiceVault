# 📝 {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Summary

{{summary}}

{{#if discussionPoints}}
## Key Points

{{#each discussionPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if actionItems}}
## Action Items

{{#each actionItems}}
- [ ] {{task}}{{#if assignee}} (@{{assignee}}){{/if}}{{#if deadline}} — Due: {{deadline}}{{/if}}
{{/each}}
{{/if}}

## Full Transcript

{{#each transcript}}
**({{formatTime timestamp}}):** {{text}}

{{/each}}

{{#if relatedRecordings}}
## Related

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
