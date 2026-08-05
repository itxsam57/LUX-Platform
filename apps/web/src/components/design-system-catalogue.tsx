"use client";

import { useState, type ReactNode } from "react";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  FilePicker,
  IconButton,
  Input,
  LinkButton,
  Pagination,
  Radio,
  Select,
  Skeleton,
  Status,
  Stepper,
  Switch,
  Table,
  Textarea,
  Tooltip,
} from "./ui/primitives";
import { Dialog, Drawer, Menu, Tabs, Toast } from "./ui/interactive";

function CatalogueSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="catalogue-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="catalogue-section__header">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function DesignSystemCatalogue() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [page, setPage] = useState(2);
  const [selectedFile, setSelectedFile] = useState("No file selected");

  return (
    <main className="catalogue" id="main-content">
      <header className="catalogue-hero">
        <div>
          <span className="eyebrow">Build Slice 1</span>
          <h1>Design system</h1>
          <p className="catalogue-hero__lede">
            A quiet, premium, accessible foundation for every future LUX workspace. Components
            are intentionally generic, responsive, and free of marketplace-specific business logic.
          </p>
        </div>
        <Card className="catalogue-hero__status" as="div">
          <Status label="Catalogue active" tone="success" />
          <strong>Desktop and mobile shell</strong>
          <span>Keyboard focus, loading, empty, error, disabled, and interactive states included.</span>
        </Card>
      </header>

      <CatalogueSection
        id="tokens"
        eyebrow="Foundation"
        title="Tokens and visual language"
        description="One restrained accent, warm neutral surfaces, generous spacing, soft elevation, and motion that respects reduced-motion preferences."
      >
        <div className="token-grid">
          {[
            ["Canvas", "var(--color-canvas)"],
            ["Surface", "var(--color-surface)"],
            ["Elevated", "var(--color-surface-raised)"],
            ["Text", "var(--color-text)"],
            ["Muted", "var(--color-text-muted)"],
            ["Gold accent", "var(--color-accent)"],
            ["Success", "var(--color-success)"],
            ["Danger", "var(--color-danger)"],
          ].map(([label, color]) => (
            <Card className="token-card" as="div" key={label}>
              <span className="token-card__swatch" style={{ background: color }} aria-hidden="true" />
              <strong>{label}</strong>
              <code>{color}</code>
            </Card>
          ))}
        </div>
        <div className="type-sample">
          <div>
            <span className="eyebrow">Display</span>
            <p className="type-display">Creator control, clearly expressed.</p>
          </div>
          <div>
            <span className="eyebrow">Body</span>
            <p className="muted-copy">Readable system typography stays compact, calm, and usable across long workflows.</p>
          </div>
        </div>
      </CatalogueSection>

      <CatalogueSection
        id="actions"
        eyebrow="Controls"
        title="Buttons and actions"
        description="Every action has a purpose, visible state, keyboard focus, and minimum touch target. Disabled controls explain why they cannot run."
      >
        <Card className="component-panel" as="div">
          <div className="component-row">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet action</Button>
            <Button variant="danger">Destructive</Button>
          </div>
          <div className="component-row">
            <Button size="small">Small</Button>
            <Button size="large">Large action</Button>
            <Button loading>Saving</Button>
            <Button disabled title="Available after the required verification step">Unavailable</Button>
            <IconButton label="Save item" icon="☆" />
            <LinkButton href="#forms" variant="secondary">Go to forms</LinkButton>
          </div>
        </Card>
      </CatalogueSection>

      <CatalogueSection
        id="forms"
        eyebrow="Input"
        title="Forms and selection"
        description="Labels, descriptions, validation, selection isolation, and clear recoverable states are built into each field pattern."
      >
        <div className="catalogue-grid catalogue-grid--two">
          <Card className="component-panel" as="div">
            <Input id="display-name" label="Display name" placeholder="Public display name" description="Shown only where the future privacy setting allows it." />
            <Input id="handle" label="Handle" defaultValue="lux-example" error="This handle is already reserved." />
            <Select id="language" label="Preferred language" defaultValue="en">
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="it">Italian</option>
            </Select>
            <Textarea id="notes" label="Private notes" rows={4} placeholder="Write a concise internal note" />
          </Card>
          <Card className="component-panel" as="div">
            <fieldset className="ui-fieldset">
              <legend>Visibility</legend>
              <Checkbox id="anonymous-support" label="Support anonymously" description="Public activity will not reveal the account identity." defaultChecked />
              <Switch id="profile-preview" label="Profile preview" description="Allow a safe public preview." defaultChecked />
            </fieldset>
            <fieldset className="ui-fieldset">
              <legend>Delivery preference</legend>
              <Radio id="delivery-private" name="delivery" label="Private library" defaultChecked />
              <Radio id="delivery-email" name="delivery" label="Email notice" />
            </fieldset>
            <FilePicker
              id="sample-file"
              label="File picker"
              description="Catalogue fixture only. No upload or persistence occurs in Slice 1."
              accept="image/png,image/jpeg,application/pdf"
              onChange={(event) => setSelectedFile(event.target.files?.[0]?.name ?? "No file selected")}
            />
            <p className="field-result" aria-live="polite">{selectedFile}</p>
          </Card>
        </div>
      </CatalogueSection>

      <CatalogueSection
        id="data-display"
        eyebrow="Content"
        title="Data display and status"
        description="Reusable surfaces communicate hierarchy and status without embedding any unfinished marketplace workflow."
      >
        <div className="component-row component-row--spread">
          <div className="component-row">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Featured</Badge>
            <Badge tone="success">Approved</Badge>
            <Badge tone="warning">Needs review</Badge>
            <Badge tone="danger">Blocked</Badge>
            <Badge tone="info">Information</Badge>
          </div>
          <div className="component-row">
            <Avatar initials="LA" label="LUX example account" size="small" />
            <Avatar initials="CR" label="Creator example" />
            <Avatar initials="AG" label="Agency example" size="large" />
          </div>
        </div>
        <Card className="component-panel" as="div">
          <Table caption="Example review queue">
            <thead>
              <tr><th scope="col">Reference</th><th scope="col">State</th><th scope="col">Updated</th></tr>
            </thead>
            <tbody>
              <tr><td>Case 1042</td><td><Status label="Ready" tone="success" /></td><td>Today</td></tr>
              <tr><td>Case 1041</td><td><Status label="Review" tone="warning" /></td><td>Yesterday</td></tr>
              <tr><td>Case 1040</td><td><Status label="Restricted" tone="danger" /></td><td>2 days ago</td></tr>
            </tbody>
          </Table>
          <Pagination currentPage={page} totalPages={4} onPageChange={setPage} />
        </Card>
      </CatalogueSection>

      <CatalogueSection
        id="navigation"
        eyebrow="Movement"
        title="Navigation and progress"
        description="The shell keeps route context visible on desktop and mobile, while shared navigation patterns remain role-neutral."
      >
        <Card className="component-panel" as="div">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Design system", href: "/design-system" }, { label: "Navigation" }]} />
          <Stepper steps={["Details", "Review", "Confirm", "Complete"]} current={1} />
          <Tabs
            idPrefix="catalogue-tabs"
            items={[
              { id: "overview", label: "Overview", content: <p>Tab panels use real ARIA relationships and arrow-key movement.</p> },
              { id: "permissions", label: "Permissions", content: <p>Future role checks belong at trusted server and database boundaries, not inside presentation components.</p> },
              { id: "history", label: "History", content: <p>Back, forward, refresh, and direct routes remain part of every future workflow test.</p> },
            ]}
          />
        </Card>
      </CatalogueSection>

      <CatalogueSection
        id="feedback"
        eyebrow="System states"
        title="Loading, empty, error, and notifications"
        description="A screen is not complete until it explains absence, failure, retry, and progress without trapping the user."
      >
        <div className="catalogue-grid catalogue-grid--three">
          <EmptyState title="Nothing here yet" description="The first valid item will appear here after a real workflow creates it." action={<Button variant="secondary">Create item</Button>} />
          <ErrorState title="Could not load" description="The request failed safely and no input was discarded." action={<Button variant="secondary">Try again</Button>} />
          <Card className="component-panel skeleton-card" as="div">
            <Skeleton width="48%" height={14} />
            <Skeleton width="82%" height={30} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="72%" height={12} />
          </Card>
        </div>
        <div className="component-row">
          <Button onClick={() => setToastVisible(true)}>Show notification</Button>
          <Tooltip id="privacy-tooltip" content="Sensitive future data must never appear in logs, screenshots, or CI evidence.">
            <span className="tooltip-trigger">Privacy boundary</span>
          </Tooltip>
        </div>
        <Toast visible={toastVisible} title="Saved safely" message="The catalogue demonstrates feedback only; no server data was changed." onDismiss={() => setToastVisible(false)} />
      </CatalogueSection>

      <CatalogueSection
        id="overlays"
        eyebrow="Layered UI"
        title="Dialog, drawer, tooltip, and menu"
        description="Overlays have explicit close paths, Escape behavior, labelled content, and no hidden product action behind decorative controls."
      >
        <Card className="component-panel" as="div">
          <div className="component-row">
            <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
            <Menu
              label="Open menu"
              items={[
                { label: "Preview action", onSelect: () => setToastVisible(true) },
                { label: "Archive example", onSelect: () => setToastVisible(true) },
                { label: "Delete example", danger: true, onSelect: () => setDialogOpen(true) },
              ]}
            />
          </div>
        </Card>
        <Dialog open={dialogOpen} title="Confirm example action" description="A real destructive action would require authorization, durable server success, and an audit event before confirmation." onClose={() => setDialogOpen(false)}>
          <Status label="No production data affected" tone="info" />
        </Dialog>
        <Drawer open={drawerOpen} title="Context drawer" onClose={() => setDrawerOpen(false)}>
          <p className="muted-copy">Drawers provide supporting context without replacing the primary route or trapping navigation.</p>
          <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Done</Button>
        </Drawer>
      </CatalogueSection>
    </main>
  );
}
