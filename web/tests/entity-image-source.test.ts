import assert from "node:assert/strict";
import test from "node:test";
import { classifyDerivativeImageSource, imageReferenceUsesAvatarDerivative } from "../src/lib/entity-image-source";

test("managed media and safe local image paths use avatar derivatives", () => {
  assert.deepEqual(classifyDerivativeImageSource("/api/media/123"), { kind: "managed_media", source: "/api/media/123", mediaId: 123 });
  assert.deepEqual(classifyDerivativeImageSource("/img/npcs/lyrana.jpg"), { kind: "local_path", source: "/img/npcs/lyrana.jpg", localPath: "/img/npcs/lyrana.jpg" });
  assert.deepEqual(classifyDerivativeImageSource("/images/gods/aurelia.png"), { kind: "local_path", source: "/images/gods/aurelia.png", localPath: "/images/gods/aurelia.png" });
  assert.deepEqual(classifyDerivativeImageSource("/uploads/races/elf.webp"), { kind: "local_path", source: "/uploads/races/elf.webp", localPath: "/uploads/races/elf.webp" });
  assert.equal(imageReferenceUsesAvatarDerivative("/img/npcs/lyrana.jpg"), true);
});

test("external URLs are materialized and use server-side avatar derivatives", () => {
  assert.deepEqual(classifyDerivativeImageSource("https://example.com/image.jpg"), { kind: "external", source: "https://example.com/image.jpg" });
  assert.equal(imageReferenceUsesAvatarDerivative("https://example.com/image.jpg"), true);
  assert.equal(imageReferenceUsesAvatarDerivative("//cdn.example.com/image.jpg"), true);
});

test("path traversal and uncontrolled filesystem paths are rejected", () => {
  for (const source of [
    "/img/../../secret.jpg",
    "/img/%2e%2e/%2e%2e/secret.jpg",
    "/images/%252e%252e/secret.png",
    "C:\\Users\\Daniel\\secret.jpg",
    "/etc/passwd",
    "\\\\server\\share\\image.jpg",
  ]) {
    assert.equal(classifyDerivativeImageSource(source).kind, "none", source);
    assert.equal(imageReferenceUsesAvatarDerivative(source), false, source);
  }
});
