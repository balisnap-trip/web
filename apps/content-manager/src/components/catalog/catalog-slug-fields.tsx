"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

interface CatalogSlugFieldsProps {
  initialName?: string;
  initialSlug?: string;
}

function slugify(rawValue: string): string {
  return rawValue
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function CatalogSlugFields({ initialName = "", initialSlug = "" }: CatalogSlugFieldsProps) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug || slugify(initialName));
  const [slugIsManual, setSlugIsManual] = useState(Boolean(initialSlug));

  const generatedSlug = useMemo(() => slugify(name), [name]);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setName(nextName);
    if (!slugIsManual) {
      setSlug(slugify(nextName));
    }
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    const nextSlug = slugify(event.target.value);
    setSlug(nextSlug);
    setSlugIsManual(nextSlug !== "" && nextSlug !== generatedSlug);
  }

  function resetToAutoSlug() {
    setSlug(generatedSlug);
    setSlugIsManual(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Name" htmlFor="catalog-create-name" required>
          <Input
            id="catalog-create-name"
            name="name"
            required
            placeholder="Hidden Gems Bali"
            value={name}
            onChange={handleNameChange}
          />
        </FormField>

        <FormField
          label="Slug"
          htmlFor="catalog-create-slug"
          hint="Auto-generated from Name. You can edit this manually."
        >
          <Input
            id="catalog-create-slug"
            name="slug"
            value={slug}
            onChange={handleSlugChange}
            placeholder="hidden-gems-bali"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </FormField>
      </div>

      {slugIsManual ? (
        <Button type="button" size="sm" variant="ghost" onClick={resetToAutoSlug}>
          Reset to auto slug
        </Button>
      ) : null}
    </div>
  );
}

