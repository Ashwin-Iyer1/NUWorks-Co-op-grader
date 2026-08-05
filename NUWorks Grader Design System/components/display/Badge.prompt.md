Rounded pill badge — soft tint background + colored text, never bordered boxes.

```jsx
<Badge variant="score-high">82% match</Badge>
<Badge variant="skill-matched">Python</Badge>
<Badge variant="external">External</Badge>
<Badge variant="accent">Version 1.7</Badge>
<Badge variant="moss">For Northeastern</Badge>
```

`scoreVariant(score)` picks the right score variant (≥70 high, ≥40 medium, else low).
