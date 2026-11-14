// 영수증·계기판 사진을 서버로 보내기 전에 줄인다. 채팅과 내 정보(계기판 찍기)가 함께 쓴다.

// 영수증·계기판 사진은 긴 변 1600px JPEG로 줄여 보낸다. 서버 한도(base64 2.8MB) 안에 들도록 품질을 낮춰 가며 맞춘다.
const PHOTO_MAX_SIDE = 1600;
const PHOTO_MAX_CHARS = 2_800_000;

export type Photo = { preview: string; mediaType: "image/jpeg"; data: string };

// 고른 사진을 줄여 JPEG로 바꾼다. 휴대폰 사진은 커서 그대로 보내면 서버 한도를 넘는다.
export async function shrinkPhoto(file: File): Promise<Photo | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const preview = canvas.toDataURL("image/jpeg", quality);
      const data = preview.slice(preview.indexOf(",") + 1);
      if (data.length <= PHOTO_MAX_CHARS) return { preview, mediaType: "image/jpeg", data };
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
