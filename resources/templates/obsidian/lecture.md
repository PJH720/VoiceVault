# {{title}}

**Date:** {{formatDate date}}  
**Duration:** {{formatDuration duration}}  
{{#if category}}**Category:** {{category}}  {{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Overview

{{summary}}

## Key Points

{{#each discussionPoints}}
- 📌 {{this}}
{{/each}}

{{#if actionItems}}
## Study Notes / Follow-up

{{#each actionItems}}
- [ ] {{task}}{{#if deadline}} — Due: {{deadline}}{{/if}}
{{/each}}
{{/if}}

{{#if decisions}}
## Important Concepts

{{#each decisions}}
- {{this}}
{{/each}}
{{/if}}

## Lecture Transcript

{{#each transcript}}
{{#if speaker}}**{{speaker}}** ({{formatTime timestamp}}): {{else}}**({{formatTime timestamp}}):** {{/if}}{{text}}

{{/each}}

{{#if relatedRecordings}}
## Related Lectures

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
