import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SiteContentTabs } from "@/components/site-content/site-content-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

export default async function SiteContentAboutPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Site Content / About Us
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">About Us Editor</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                This layout separates the writing flow: brand promise, brand story, social proof, and final CTA.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/site-content">Back to overview</Link>
              </Button>
              <Button type="button" size="sm">
                Save draft (UI)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SiteContentTabs />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Hero Narrative</CardTitle>
              <CardDescription>First-impression section: heading, subheading, and primary visual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Eyebrow" htmlFor="about-eyebrow">
                  <Input id="about-eyebrow" defaultValue="ABOUT BALISNAPTRIP" />
                </FormField>
                <FormField label="Hero image URL" htmlFor="about-hero-image">
                  <Input id="about-hero-image" defaultValue="/uploads/site/about-hero.jpg" />
                </FormField>
              </div>
              <FormField label="Headline" htmlFor="about-headline">
                <Input id="about-headline" defaultValue="Curated Bali journeys built by local experts" />
              </FormField>
              <FormField label="Subheadline" htmlFor="about-subheadline">
                <Textarea
                  id="about-subheadline"
                  rows={3}
                  defaultValue="We design efficient, safe, and personalized experiences for travelers who want to enjoy Bali without hassle."
                />
              </FormField>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <Checkbox defaultChecked />
                Show quick stats below the headline
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Brand Story Blocks</CardTitle>
              <CardDescription>Use a block-based format so the narrative is easy to scan on mobile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <FormField label="Story block #1" htmlFor="about-story-1">
                  <Textarea
                    id="about-story-1"
                    rows={3}
                    defaultValue="It started from travelers needing flexible itineraries with trusted local support."
                  />
                </FormField>
                <FormField label="Story block #2" htmlFor="about-story-2">
                  <Textarea
                    id="about-story-2"
                    rows={3}
                    defaultValue="We combine destination curation, transportation management, and real-time assistance."
                  />
                </FormField>
                <FormField label="Story block #3" htmlFor="about-story-3">
                  <Textarea
                    id="about-story-3"
                    rows={3}
                    defaultValue="Each product is tested for pickup flow, travel time, and end-to-end guest experience."
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Value and CTA</CardTitle>
              <CardDescription>Ensure reasons to choose the brand and the call to action are clear.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Value point #1" htmlFor="about-value-1">
                  <Input id="about-value-1" defaultValue="Licensed local team and curated partners" />
                </FormField>
                <FormField label="Value point #2" htmlFor="about-value-2">
                  <Input id="about-value-2" defaultValue="Fast response before and during trip" />
                </FormField>
                <FormField label="Value point #3" htmlFor="about-value-3">
                  <Input id="about-value-3" defaultValue="Flexible packages for couple, family, or group" />
                </FormField>
                <FormField label="Value point #4" htmlFor="about-value-4">
                  <Input id="about-value-4" defaultValue="Transparent inclusions and pricing" />
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="CTA title" htmlFor="about-cta-title">
                  <Input id="about-cta-title" defaultValue="Plan your Bali trip with us" />
                </FormField>
                <FormField label="CTA button label" htmlFor="about-cta-label">
                  <Input id="about-cta-label" defaultValue="Start Planning" />
                </FormField>
              </div>
              <FormField label="CTA description" htmlFor="about-cta-description">
                <Textarea
                  id="about-cta-description"
                  rows={2}
                  defaultValue="Contact our team for itinerary recommendations that match your budget and travel schedule."
                />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quality Checklist</CardTitle>
              <CardDescription>Quick checklist before publishing About content.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Headline states the primary value proposition.
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Brand story paragraphs are not too long.
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Includes credibility proof (numbers, partners, or testimonials).
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Final CTA leads to a concrete action.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Media Upload UX</CardTitle>
              <CardDescription>Placeholder for image upload flow beyond plain URL input.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600 hover:bg-slate-100">
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" />
                Upload About Hero Image
              </label>
              <p className="text-xs text-slate-500">
                After media API integration is complete, this component will auto-fill the Hero image URL field.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
