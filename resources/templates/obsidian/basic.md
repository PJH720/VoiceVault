# {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

{{#if summary}}
## Summary

{{summary}}
{{/if}}

{{#if actionItems}}
## Action Items

{{#each actionItems}}
- [ ] {{task}}{{#if assignee}} (@{{assignee}}){{/if}}{{#if deadline}} — Due: {{deadline}}{{/if}}
{{/each}}
{{/if}}

{{#if discussionPoints}}
## Discussion Points

{{#each discussionPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if decisions}}
## Decisions

{{#each decisions}}
- {{this}}
{{/each}}
{{/if}}

## Transcript

{{#each transcript}}
{{#if speaker}}**{{speaker}}** ({{formatTime timestamp}}): {{else}}**({{formatTime timestamp}}):** {{/if}}{{text}}

{{/each}}

{{#if relatedRecordings}}
## Related Recordings

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
