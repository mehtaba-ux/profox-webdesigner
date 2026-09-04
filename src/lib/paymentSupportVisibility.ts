const PAYMENT_PATH_PREFIX = '/pay/';
const SUPPORT_BUTTON_TEXT = 'Chat with your ProFox representative';

function findPaymentSupportButton(): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(SUPPORT_BUTTON_TEXT),
  ) || null;
}

function makePaymentSupportButtonPersistent() {
  if (!window.location.pathname.startsWith(PAYMENT_PATH_PREFIX)) return;

  const button = findPaymentSupportButton();
  if (!button || button.dataset.profoxPaymentChatFloating === 'true') return;

  button.dataset.profoxPaymentChatFloating = 'true';
  button.setAttribute('aria-label', SUPPORT_BUTTON_TEXT);
  button.setAttribute('title', 'Open secure ProFox chat');

  // Keep the existing React button and its existing secure-chat handler.
  // Only improve its visibility so customers do not have to find the support card below the fold.
  Object.assign(button.style, {
    position: 'fixed',
    right: '16px',
    bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    width: 'min(320px, calc(100vw - 32px))',
    zIndex: '2147483000',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.22)',
  });
}

function startPaymentSupportVisibilityGuard() {
  makePaymentSupportButtonPersistent();

  const observer = new MutationObserver(() => {
    makePaymentSupportButtonPersistent();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', makePaymentSupportButtonPersistent);
  window.addEventListener('hashchange', makePaymentSupportButtonPersistent);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPaymentSupportVisibilityGuard, { once: true });
  } else {
    startPaymentSupportVisibilityGuard();
  }
}
