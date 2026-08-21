import Link from "next/link";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { SubmitButton } from "@/components/submit-button";
import { getEntityImageProfile } from "@/lib/entity-image-profiles";
import { updateRaceImageAction } from "../actions";

type Props = {
  projectId: number;
  raceId: number;
  raceName: string;
  currentImage: string | null;
};

export async function RaceImageCropPanel({ projectId, raceId, raceName, currentImage }: Props) {
  const imageProfile = await getEntityImageProfile(projectId, "race", raceId, currentImage);

  return <section className="panel-card edit-section">
    <div className="panel-heading">
      <div>
        <span className="panel-kicker">BILD & 1:1-PROFILZUSCHNITT</span>
        <h2>Speziesbild zuschneiden</h2>
      </div>
      <Link className="button ghost" href={`/admin/projects/${projectId}/races/${raceId}/image`}>Großansicht öffnen</Link>
    </div>
    <p className="section-help">
      Das Originalbild bleibt vollständig erhalten. Für Listen, Profilbilder und den runden Kartenmarker kannst du hier einen eigenen quadratischen Ausschnitt festlegen.
    </p>
    <form action={updateRaceImageAction.bind(null, projectId, raceId)} className="stack">
      <input type="hidden" name="returnTo" value="detail"/>
      <ProfileImageEditor
        current={currentImage}
        currentCrop={imageProfile?.crop}
        label={`Bild von ${raceName}`}
      />
      <div className="sticky-savebar">
        <div>
          <strong>Bild & Zuschnitt speichern</strong>
          <span>{imageProfile ? "Ein gespeicherter 1:1-Zuschnitt ist aktiv." : "Ohne Zuschnitt bleibt das vollständige Original als Fallback erhalten."}</span>
        </div>
        <SubmitButton className="primary" pendingLabel="Bildprofil wird gespeichert …">Bild & Zuschnitt speichern</SubmitButton>
      </div>
    </form>
  </section>;
}
