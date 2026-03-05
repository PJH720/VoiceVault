# 🎙️ {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Episode Summary

{{summary}}

{{#if discussionPoints}}
## Topics Discussed

{{#each discussionPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if decisions}}
## Key Takeaways

{{#each decisions}}
- {{this}}
{{/each}}
{{/if}}

## Transcript

{{#each transcript}}
{{#if speaker}}**{{speaker}}** ({{formatTime timestamp}}): {{else}}**({{formatTime timestamp}}):** {{/if}}{{text}}

{{/each}}

{{#if relatedRecordings}}
## Related Episodes

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
