Detail modal — rounded card, serif title, round close button. ModalSection gives moss eyebrow headers.

```jsx
<Modal open title="Software Engineer Co-op" company="Klaviyo — Boston, MA"
  tags={<><Badge variant="score-high">82% Match</Badge><Badge>Co-op</Badge></>}
  actions={<><Button>Save Job</Button><Button variant="secondary">Open in NUWorks</Button></>}
  onClose={fn}>
  <ModalSection title="Description">…</ModalSection>
</Modal>
```
