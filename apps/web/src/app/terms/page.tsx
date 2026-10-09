import type { Metadata } from "next";
import { PublicInfoPage, PublicInfoSection } from "@/components/public/public-info-page";

export const metadata: Metadata = { title: "Terms | LUX Platform" };

export default function TermsPage() {
  return (
    <PublicInfoPage
      eyebrow="Public legal information"
      title="Platform terms"
      intro="These platform terms describe the baseline rules for using LUX. Project contracts, consent records, campaign terms, funding terms, release permissions, and payout rules may add more specific obligations."
    >
      <PublicInfoSection title="Account and age requirements">
        <p>LUX is for adults who can lawfully use the service. Users must keep account access secure, provide truthful information where verification is required, and use only roles and workspaces they are authorized to access.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Projects, consent, and funding">
        <p>A collaboration invitation is not legal consent. Material project terms, depicted-person consent, campaign commitments, supporter changes, release permissions, and payout rules must be accepted through the specific LUX flows that apply to them.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Safety and platform enforcement">
        <p>Users may not abuse, defraud, harass, impersonate, evade access controls, upload stolen material, or interfere with platform security. LUX may restrict content, accounts, payouts, or releases when an authorized moderation, copyright, finance, incident, abuse, or legal-hold process requires it.</p>
      </PublicInfoSection>
    </PublicInfoPage>
  );
}
