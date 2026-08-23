"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_ACTION_STATE,
  saveProfileAction,
  uploadProfileMediaAction,
} from "@/app/settings/profile/actions";
import { Button, FilePicker, Input, Select, Textarea } from "@/components/ui/primitives";
import type { ProfileLink, ProfileVisibility } from "@/lib/profile/policy";

export type EditableProfile = {
  handle: string;
  displayName: string;
  bio: string;
  links: ProfileLink[];
  languageCode: string;
  visibility: ProfileVisibility;
  hasAvatar: boolean;
  hasBanner: boolean;
};

function Message({ state }: { state: { status: string; message: string } }) {
  if (!state.message) return null;
  return (
    <div
      className={state.status === "success" ? "auth-message auth-message--success" : "auth-message auth-message--error"}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
      data-testid="profile-action-message"
    >
      {state.message}
    </div>
  );
}

export function ProfileEditor({ profile }: { profile: EditableProfile }) {
  const [profileState, saveAction, saving] = useActionState(saveProfileAction, INITIAL_PROFILE_ACTION_STATE);
  const [avatarState, avatarAction, uploadingAvatar] = useActionState(uploadProfileMediaAction, INITIAL_PROFILE_ACTION_STATE);
  const [bannerState, bannerAction, uploadingBanner] = useActionState(uploadProfileMediaAction, INITIAL_PROFILE_ACTION_STATE);
  const linkRows = Array.from({ length: 5 }, (_, index) => profile.links[index] ?? { label: "", url: "" });

  return (
    <div className="profile-settings-grid">
      <section className="ui-card profile-editor-card" aria-labelledby="profile-details-title">
        <div>
          <span className="eyebrow">Public identity</span>
          <h2 id="profile-details-title">Profile details</h2>
          <p className="muted-copy">Only the fields shown here can appear in the public profile projection. Email, account UUID, age records, and auth metadata stay private.</p>
        </div>

        <form action={saveAction} className="profile-editor-form" noValidate>
          <Input
            id="profile-handle"
            name="handle"
            label="Handle"
            description="3–30 lowercase letters, numbers, or underscores. Changing it updates your public profile URL."
            defaultValue={profile.handle}
            maxLength={30}
            required
            error={profileState.fieldErrors?.handle}
          />
          <Input
            id="profile-display-name"
            name="display_name"
            label="Display name"
            defaultValue={profile.displayName}
            maxLength={80}
            required
            error={profileState.fieldErrors?.display_name}
          />
          <Textarea
            id="profile-bio"
            name="bio"
            label="Bio"
            description="Plain text only, up to 500 characters."
            defaultValue={profile.bio}
            maxLength={500}
            rows={6}
            error={profileState.fieldErrors?.bio}
          />
          <Input
            id="profile-language"
            name="language_code"
            label="Language"
            description="Use a language tag such as en, en-US, or ur-PK."
            defaultValue={profile.languageCode}
            maxLength={16}
            required
            error={profileState.fieldErrors?.language_code}
          />
          <Select
            id="profile-visibility"
            name="visibility"
            label="Profile visibility"
            defaultValue={profile.visibility}
            error={profileState.fieldErrors?.visibility}
          >
            <option value="public">Public — visible and discoverable</option>
            <option value="unlisted">Unlisted — visible by direct link, not discovery</option>
            <option value="private">Private — visible only to you</option>
          </Select>

          <fieldset className="profile-links-fieldset">
            <legend>Profile links</legend>
            <p className="ui-field__description">Up to five HTTPS links. URL credentials and non-HTTPS schemes are rejected.</p>
            {linkRows.map((link, index) => (
              <div className="profile-link-row" key={`profile-link-${index + 1}`}>
                <Input
                  id={`profile-link-label-${index + 1}`}
                  name={`link_label_${index + 1}`}
                  label={`Link ${index + 1} label`}
                  defaultValue={link.label}
                  maxLength={80}
                />
                <Input
                  id={`profile-link-url-${index + 1}`}
                  name={`link_url_${index + 1}`}
                  label={`Link ${index + 1} URL`}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                  defaultValue={link.url}
                />
              </div>
            ))}
            {profileState.fieldErrors?.links ? <p className="ui-field__error" role="alert">{profileState.fieldErrors.links}</p> : null}
          </fieldset>

          <Message state={profileState} />
          <Button type="submit" loading={saving}>Save profile</Button>
        </form>
      </section>

      <aside className="profile-media-stack" aria-label="Profile images">
        <section className="ui-card profile-media-card">
          <div>
            <span className="eyebrow">Avatar</span>
            <h2>Profile image</h2>
            <p className="muted-copy">JPEG, PNG, or WebP up to 5 MiB. LUX decodes it, auto-orients it, strips metadata, constrains it to 1024×1024, and stores only WebP.</p>
          </div>
          <span className="profile-media-state">{profile.hasAvatar ? "Avatar attached" : "No avatar attached"}</span>
          <form action={avatarAction} className="profile-media-form">
            <input type="hidden" name="kind" value="avatar" />
            <FilePicker id="avatar-file" name="file" label="Choose avatar" accept="image/jpeg,image/png,image/webp" required />
            {avatarState.fieldErrors?.avatar_file ? <p className="ui-field__error" role="alert">{avatarState.fieldErrors.avatar_file}</p> : null}
            <Message state={avatarState} />
            <Button type="submit" variant="secondary" loading={uploadingAvatar}>Process and upload avatar</Button>
          </form>
        </section>

        <section className="ui-card profile-media-card">
          <div>
            <span className="eyebrow">Banner</span>
            <h2>Profile banner</h2>
            <p className="muted-copy">JPEG, PNG, or WebP up to 10 MiB. Output is metadata-free WebP constrained to 2400×900.</p>
          </div>
          <span className="profile-media-state">{profile.hasBanner ? "Banner attached" : "No banner attached"}</span>
          <form action={bannerAction} className="profile-media-form">
            <input type="hidden" name="kind" value="banner" />
            <FilePicker id="banner-file" name="file" label="Choose banner" accept="image/jpeg,image/png,image/webp" required />
            {bannerState.fieldErrors?.banner_file ? <p className="ui-field__error" role="alert">{bannerState.fieldErrors.banner_file}</p> : null}
            <Message state={bannerState} />
            <Button type="submit" variant="secondary" loading={uploadingBanner}>Process and upload banner</Button>
          </form>
        </section>
      </aside>
    </div>
  );
}
