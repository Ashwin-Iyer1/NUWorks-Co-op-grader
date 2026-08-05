The product's core object — a job listing with match score, skill tags, and status flags.

```jsx
<JobCard title="Software Engineer Co-op" company="Klaviyo" score={82}
  meta={["Boston, MA", "Posted 3d ago"]}
  matched={["Python", "React"]} missing={["Kubernetes"]}
  flags={["external"]}
  actions={<Button size="sm">Save</Button>} />
```

Hover lifts 2px with a soft shadow. Composes Badge + ScoreBar.
