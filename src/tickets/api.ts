import type { Session } from '@supabase/supabase-js';
import { ticketSupabase } from './supabase';

const apiUrl = (
  import.meta.env.VITE_TICKET_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/$/, '');
const proofBucket = 'ticket-payment-proofs';
const proofExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_PROOF_BYTES = 30 * 1024 * 1024;

async function preparePaymentProof(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Galereyadan chek rasmi tanlang.');
  }
  if (!file.size) throw new Error('Tanlangan rasm bo‘sh.');
  if (file.size > MAX_SOURCE_PROOF_BYTES) {
    throw new Error('Chek rasmi 30 MB dan katta. Galereyadan kichikroq rasm tanlang.');
  }
  if (proofExtensions[file.type] && file.size <= MAX_PROOF_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Bu rasm formatini telefonda ochib bo‘lmadi. Chekni JPG yoki PNG qilib saqlab, qayta tanlang.');
  }

  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Rasmni tayyorlash imkoni bo‘lmadi. Qayta urinib ko‘ring.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const toJpeg = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Rasmni kichraytirib bo‘lmadi.')),
        'image/jpeg',
        quality,
      );
    });
    let result = await toJpeg(0.88);
    if (result.size > MAX_PROOF_BYTES) result = await toJpeg(0.76);
    if (result.size > MAX_PROOF_BYTES) {
      throw new Error('Rasm juda katta. Galereyadan kichikroq chek rasmini tanlang.');
    }

    const filename = file.name.replace(/\.[^.]+$/, '') || 'tolov-cheki';
    return new File([result], `${filename}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

async function reconcileFailedSubmission(
  orderId: string,
  proofPath: string,
): Promise<{ status: string; message: string } | null> {
  const { data: order, error: orderError } = await ticketSupabase
    .from('ticket_orders')
    .select('proof_path,status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    throw new Error(`Chek holatini tekshirib bo‘lmadi: ${orderError.message}`);
  }
  if (order?.proof_path === proofPath) {
    return {
      status: order.status === 'approved' ? 'approved' : 'needs_review',
      message: order.status === 'approved'
        ? 'To‘lov tasdiqlandi. QR-kodli chiptangiz tayyor.'
        : 'Chek qabul qilindi va admin tekshiruviga yuborildi.',
    };
  }

  const { error: removeError } = await ticketSupabase.storage
    .from(proofBucket)
    .remove([proofPath]);
  if (removeError) {
    throw new Error(`Chek yuborilmadi va yuklangan faylni tozalab bo‘lmadi: ${removeError.message}`);
  }
  return null;
}

export async function uploadPaymentProof(
  session: Session,
  orderId: string,
  file: File,
): Promise<{ status: string; message: string }> {
  const preparedFile = await preparePaymentProof(file);
  const extension = proofExtensions[preparedFile.type];
  if (!extension) throw new Error('Chek rasmi JPG, PNG yoki WEBP formatida bo‘lishi kerak.');

  const proofPath = `${session.user.id}/${orderId}/${crypto.randomUUID()}${extension}`;
  const { error: uploadError } = await ticketSupabase.storage
    .from(proofBucket)
    .upload(proofPath, preparedFile, { contentType: preparedFile.type, upsert: false });
  if (uploadError) {
    throw new Error(`Chekni xavfsiz saqlashga yuklab bo‘lmadi: ${uploadError.message}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/payments/${orderId}/proof`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ proof_path: proofPath, content_type: preparedFile.type }),
    });
  } catch (requestError) {
    const reconciled = await reconcileFailedSubmission(orderId, proofPath);
    if (reconciled) return reconciled;
    throw new Error(
      requestError instanceof Error
        ? `To‘lov tekshiruvi serveriga ulanib bo‘lmadi: ${requestError.message}`
        : 'To‘lov tekshiruvi serveriga ulanib bo‘lmadi.',
    );
  }

  const result = (await response.json().catch(() => null)) as
    | { detail?: string; status?: string; message?: string }
    | null;
  if (!response.ok) {
    const reconciled = await reconcileFailedSubmission(orderId, proofPath);
    if (reconciled) return reconciled;
    throw new Error(result?.detail || 'Chekni yuborishda xatolik yuz berdi.');
  }
  if (!result?.status) throw new Error('Serverdan tushunarsiz javob keldi.');
  return { status: result.status, message: result.message || 'Chek qabul qilindi.' };
}

export const ticketApiUrl = apiUrl;
