import type { Metadata } from "next";
import { PublicInfoPage, PublicInfoSection } from "@/components/public/public-info-page";

export const metadata: Metadata = { title: "Privacy | LUX Platform" };

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Public legal information"
      title="Privacy"
      intro="LUX limits public exposure of account, supporter, verification, production, payment, and evidence data and gives signed-in users privacy controls in their workspace."
    >
      <PublicInfoSection title="What LUX uses">
        <p>Account and profile information is used to operate authentication, workspaces, campaigns, funding, production, review, release, payouts, moderation, and support. Sensitive provider references and internal identifiers are kept out of public projections.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Public and private choices">
        <p>Profile visibility and supporter identity settings control what other users can see. Private production assets, identity evidence, contracts, payout records, moderation evidence, and account security data are restricted to authorized roles.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Your controls">
        <p>Signed-in users can review privacy settings and use the available export and deletion-request flows. Some records may need to remain restricted rather than immediately deleted when they are needed for security, accounting, disputes, legal holds, or platform integrity.</p>
      </PublicInfoSection>
    </PublicInfoPage>
  );
}
