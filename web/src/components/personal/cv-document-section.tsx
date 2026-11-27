"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfViewer } from "@/components/layout/pdf-viewer";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { usePersonalProfileQuery } from "@/hooks/use-personal-profile";

/**
 * The CV as a document, beside the form that fills it in.
 *
 * Shown rather than offered as a download, for the same reason the invoice is shown before it
 * is sent: nobody can tell from a form whether what comes out of it reads well. This is the
 * page somebody hands to a foreman, and it is the first time they see it.
 *
 * It is the API's document, not a second drawing of it in HTML. A preview that was its own
 * implementation could be wrong about the thing it claims to show, which would make it worse
 * than no preview at all.
 */
export function CvDocumentSection() {
  const { data } = usePersonalProfileQuery();
  const ready = data?.hasContent ?? false;

  // Keyed on the moment the CV was last saved, so saving the form above redraws the document
  // below with nothing to press. An unknown query parameter costs the API nothing.
  const pdf = usePdfDocument(
    ready ? `mon-profil/pdf?v=${encodeURIComponent(data?.updatedAt ?? "")}` : null,
  );

  const name = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Votre CV en PDF</CardTitle>
        <CardDescription>
          Le même CV que reçoivent les entreprises d&apos;ici, mis en page. Imprimez-le, ou
          envoyez-le à une entreprise qui n&apos;est pas sur Vexta.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {ready ? (
          <PdfViewer
            url={pdf.url}
            loading={pdf.loading}
            error={pdf.error}
            title="Aperçu de votre CV"
            fileName={name ? `CV - ${name}.pdf` : "CV.pdf"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Remplissez au moins une section — un titre, un résumé, une expérience, une
            formation ou une carte — et votre CV apparaîtra ici.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
