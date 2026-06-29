const frame = document.getElementById('myFrame');
let activeFrameResizeTimers = [];
let activeFramePollTimer = null;
let activeParentResizeObserver = null;
let activeParentMutationObserver = null;

function measureDocumentHeight(doc) {
    if (!doc) {
        return 0;
    }

    const body = doc.body;
    const root = doc.documentElement;

    return Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        body ? body.clientHeight : 0,
        root ? root.scrollHeight : 0,
        root ? root.offsetHeight : 0,
        root ? root.clientHeight : 0
    );
}

function postIframeHeight() {
    const height = measureDocumentHeight(document);

    if (!height || window.parent === window) {
        return;
    }

    window.parent.postMessage({ type: 'resize', height }, '*');
}

function setupChildFrameSizing() {
    document.documentElement.classList.add('iframe-page');
    document.body.classList.add('iframe-page');

    const notifyParent = () => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(postIframeHeight);
        });
    };

    window.addEventListener('load', notifyParent);
    window.addEventListener('resize', notifyParent);
    window.addEventListener('pageshow', notifyParent);

    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        document.fonts.ready.then(notifyParent);
    }

    const resizeObserver = new ResizeObserver(notifyParent);
    resizeObserver.observe(document.documentElement);

    if (document.body) {
        resizeObserver.observe(document.body);
    }

    const mutationObserver = new MutationObserver(notifyParent);
    mutationObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
    });

    document.querySelectorAll('img, video, iframe').forEach((element) => {
        element.addEventListener('load', notifyParent);
        element.addEventListener('error', notifyParent);
    });

    // Keep iframe content non-scrollable and forward wheel scrolling to parent.
    const forwardScrollToParent = (event) => {
        event.preventDefault();
        window.parent.postMessage(
            {
                type: 'scroll-parent',
                deltaX: event.deltaX,
                deltaY: event.deltaY
            },
            '*'
        );
    };

    window.addEventListener('wheel', forwardScrollToParent, { passive: false });

    notifyParent();
    window.setTimeout(notifyParent, 150);
    window.setTimeout(notifyParent, 600);
}

function setupParentFrameSizing() {
    if (!frame) {
        return;
    }

    let isFrameNavigating = false;

    const applyFrameHeight = (height) => {
        if (!Number.isFinite(height) || height <= 0) {
            return;
        }

        frame.style.height = `${Math.ceil(height)}px`;
    };

    const resizeFromFrameDocument = () => {
        if (isFrameNavigating) {
            return;
        }

        try {
            applyFrameHeight(measureDocumentHeight(frame.contentDocument));
        } catch (error) {
            frame.style.height = '80vh';
        }
    };

    const disconnectFrameObservers = () => {
        if (activeParentResizeObserver) {
            activeParentResizeObserver.disconnect();
            activeParentResizeObserver = null;
        }

        if (activeParentMutationObserver) {
            activeParentMutationObserver.disconnect();
            activeParentMutationObserver = null;
        }
    };

    const observeFrameDocument = () => {
        disconnectFrameObservers();

        try {
            const doc = frame.contentDocument;

            if (!doc) {
                return;
            }

            const notifyParent = () => {
                window.requestAnimationFrame(resizeFromFrameDocument);
            };

            activeParentResizeObserver = new ResizeObserver(notifyParent);
            activeParentResizeObserver.observe(doc.documentElement);

            if (doc.body) {
                activeParentResizeObserver.observe(doc.body);
            }

            activeParentMutationObserver = new MutationObserver(notifyParent);
            activeParentMutationObserver.observe(doc.documentElement, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true
            });

            doc.querySelectorAll('img, video, iframe').forEach((element) => {
                element.addEventListener('load', notifyParent);
                element.addEventListener('error', notifyParent);
            });

            notifyParent();
        } catch (error) {
            disconnectFrameObservers();
        }
    };

    const scheduleFrameMeasurements = () => {
        const checkpoints = [0, 50, 150, 300, 600, 1000];

        activeFrameResizeTimers.forEach((timerId) => window.clearTimeout(timerId));
        activeFrameResizeTimers = [];

        checkpoints.forEach((delay) => {
            const timerId = window.setTimeout(resizeFromFrameDocument, delay);
            activeFrameResizeTimers.push(timerId);
        });
    };

    const clearFrameMeasurements = () => {
        activeFrameResizeTimers.forEach((timerId) => window.clearTimeout(timerId));
        activeFrameResizeTimers = [];

        if (activeFramePollTimer) {
            window.clearInterval(activeFramePollTimer);
            activeFramePollTimer = null;
        }
    };

    const startFramePolling = () => {
        let attempts = 0;

        if (activeFramePollTimer) {
            window.clearInterval(activeFramePollTimer);
        }

        activeFramePollTimer = window.setInterval(() => {
            resizeFromFrameDocument();
            attempts += 1;

            if (attempts >= 20) {
                window.clearInterval(activeFramePollTimer);
                activeFramePollTimer = null;
            }
        }, 150);
    };

    frame.addEventListener('load', () => {
        isFrameNavigating = false;
        observeFrameDocument();
        scheduleFrameMeasurements();
        startFramePolling();
    });

    window.addEventListener('resize', resizeFromFrameDocument);

    document.querySelectorAll('a[target="myFrame"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            isFrameNavigating = true;
            clearFrameMeasurements();
            disconnectFrameObservers();
            frame.style.height = '0px';
            frame.src = link.href;
        });
    });

    window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow || isFrameNavigating) {
            return;
        }

        if (event.data && event.data.type === 'resize') {
            applyFrameHeight(Number(event.data.height));
            return;
        }

        if (event.data && event.data.type === 'scroll-parent') {
            const deltaX = Number(event.data.deltaX) || 0;
            const deltaY = Number(event.data.deltaY) || 0;
            window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
        }
    });

    scheduleFrameMeasurements();
}

if (window.parent !== window) {
    setupChildFrameSizing();
} else {
    setupParentFrameSizing();
}

