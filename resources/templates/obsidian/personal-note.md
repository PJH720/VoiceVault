# {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Summary

{{summary}}

{{#if discussionPoints}}
## Thoughts

{{#each discussionPoints}}
- {{this}}
{{/each}}
{{/if}}

## Transcript

{{#each transcript}}
**({{formatTime timestamp}}):** {{text}}

{{/each}}

{{#if relatedRecordings}}
## Related Notes

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
