import { put } from "@vercel/blob";
import { jsonError } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return jsonError("BLOB_READ_WRITE_TOKEN mühit dəyişəni təyin olunmayıb.", 500);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_IMAGE_SIZE + 64 * 1024
  ) {
    return jsonError("Şəklin ölçüsü 4 MB-dan çox olmamalıdır.", 413);
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File)) {
    return jsonError("Yükləmək üçün şəkil seçilməyib.", 400);
  }
  if (!Object.hasOwn(IMAGE_EXTENSIONS, image.type)) {
    return jsonError("PNG, JPEG, GIF və ya WebP formatlı şəkil yükləyin.", 400);
  }
  if (image.size === 0 || image.size > MAX_IMAGE_SIZE) {
    return jsonError("Şəklin ölçüsü 4 MB-dan çox olmamalıdır.", 400);
  }

  try {
    const blob = await put(
      `task-images/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[image.type]}`,
      image,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: image.type,
        token,
      },
    );
    return Response.json({ url: blob.url });
  } catch (cause) {
    console.error("Vercel Blob task image upload failed:", cause);
    return jsonError("Şəkli Vercel Blob-a yükləmək alınmadı.", 502);
  }
}
