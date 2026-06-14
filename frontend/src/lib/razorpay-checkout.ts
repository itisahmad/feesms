declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export type RazorpaySuccessPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export async function openRazorpayCheckout(
  orderId: string,
  amountPaise: number,
  onSuccess: (resp: RazorpaySuccessPayload) => Promise<void>,
  options?: { name?: string; description?: string },
) {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) {
    throw new Error('Failed to load Razorpay checkout.');
  }

  const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!key) {
    throw new Error('NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured.');
  }

  return new Promise<void>((resolve, reject) => {
    const rz = new window.Razorpay({
      key,
      amount: amountPaise,
      currency: 'INR',
      order_id: orderId,
      name: options?.name || 'SchoolFee Pro',
      description: options?.description,
      handler: async (response: unknown) => {
        try {
          const payload = response as RazorpaySuccessPayload;
          await onSuccess(payload);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled.')),
      },
      theme: { color: '#14b8a6' },
    });
    rz.open();
  });
}
