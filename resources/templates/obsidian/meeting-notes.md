# {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Summary

{{summary}}

## Action Items

{{#each actionItems}}
- [ ] {{task}}{{#if assignee}} (@{{assignee}}){{/if}}{{#if deadline}} — Due: {{deadline}}{{/if}}{{#if priority}} [{{priority}}]{{/if}}
{{/each}}

## Discussion Points

{{#each discussionPoints}}
- {{this}}
{{/each}}

{{#if decisions}}
## Decisions

{{#each decisions}}
- ✅ {{this}}
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
