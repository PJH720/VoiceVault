# {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Summary

{{summary}}

{{#if discussionPoints}}
## Key Topics Covered

{{#each discussionPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if actionItems}}
## Follow-up Items

{{#each actionItems}}
- [ ] {{task}}{{#if assignee}} (@{{assignee}}){{/if}}{{#if deadline}} — Due: {{deadline}}{{/if}}
{{/each}}
{{/if}}

{{#if decisions}}
## Outcomes / Decisions

{{#each decisions}}
- {{this}}
{{/each}}
{{/if}}

## Interview Transcript

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
