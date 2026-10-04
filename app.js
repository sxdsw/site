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

    // root.clientHeight and root.scrollHeight are deliberately excluded:
    // per spec, both are defined for the root element as max(content size,
    // viewport height) — and inside an iframe, that viewport IS the
    // iframe's own current rendered size. Including either makes the
    // measurement a floor that can grow but never shrink back down once
    // content changes to something shorter. body's own metrics and the
    // root's offsetHeight (a plain CSS box height, not viewport-special-
    // cased) aren't affected, so they're enough on their own.
    return Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        root ? root.offsetHeight : 0
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

    // pages/work.html swaps its decrypted content into this same document
    // (no nested iframe), so it calls this directly after each content/image
    // change instead of waiting on the observers below to notice.
    window.notifyFrameResize = notifyParent;

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
    let hasAppliedHeight = false;

    const applyFrameHeight = (height) => {
        if (!Number.isFinite(height) || height <= 0) {
            return;
        }

        hasAppliedHeight = true;
        frame.style.height = `${Math.ceil(height)}px`;
    };

    const resizeFromFrameDocument = () => {
        if (isFrameNavigating) {
            return;
        }

        try {
            applyFrameHeight(measureDocumentHeight(frame.contentDocument));
        } catch (error) {
            // A direct cross-frame read can fail while the work gate is
            // swapping content in and out; the child's own postMessage
            // (notifyFrameResize in setupChildFrameSizing) already reaches
            // applyFrameHeight in that case, so only guess a fallback height
            // here if nothing has set a real one yet — otherwise this would
            // keep clobbering a correct height with a fixed 80vh.
            if (!hasAppliedHeight) {
                frame.style.height = '80vh';
            }
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
        hasAppliedHeight = false;
        observeFrameDocument();
        scheduleFrameMeasurements();
        startFramePolling();
    });

    window.addEventListener('resize', resizeFromFrameDocument);

    // Projects unlocked inside pages/work.html are listed in the Work tab. The
    // key never leaves that frame — these links only ask it to swap entry, so
    // navigating the frame anywhere else drops them and re-locks the section.
    const workLinks = document.getElementById('workLinks');

    function clearWorkEntries() {
        if (!workLinks) {
            return;
        }
        workLinks.querySelectorAll('[data-work-entry]').forEach((el) => el.remove());
    }

    function showWorkEntries(entries) {
        if (!workLinks || !Array.isArray(entries)) {
            return;
        }
        clearWorkEntries();

        for (const entry of entries) {
            if (!entry || typeof entry.file !== 'string' || typeof entry.title !== 'string') {
                continue;
            }
            const row = document.createElement('div');
            row.className = 'expandDetails';
            row.dataset.workEntry = '';

            const link = document.createElement('a');
            link.className = 'linkPage';
            link.href = '#';
            link.textContent = entry.title;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                for (const other of workLinks.querySelectorAll('[data-work-entry] a')) {
                    other.setAttribute('aria-current', String(other === link));
                }
                frame.contentWindow.postMessage({ type: 'work-show', file: entry.file }, '*');
            });

            row.append(link);
            workLinks.append(row);
        }

        const first = workLinks.querySelector('[data-work-entry] a');
        if (first) {
            first.setAttribute('aria-current', 'true');
        }
        workLinks.closest('details')?.setAttribute('open', '');
    }

    document.querySelectorAll('a[target="myFrame"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            isFrameNavigating = true;
            clearWorkEntries();
            clearFrameMeasurements();
            disconnectFrameObservers();
            frame.style.height = '0px';
            frame.src = link.href;
        });
    });

    // Expanding "Others" loads the Work gate straight into the frame — no
    // separate "Work" link to click first.
    const othersDetails = document.getElementById('othersDetails');

    if (othersDetails) {
        othersDetails.addEventListener('toggle', () => {
            if (!othersDetails.open || frame.src.endsWith('/pages/work.html')) {
                return;
            }

            isFrameNavigating = true;
            clearWorkEntries();
            clearFrameMeasurements();
            disconnectFrameObservers();
            frame.style.height = '0px';
            frame.src = 'pages/work.html';
        });
    }

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
            return;
        }

        if (event.data && event.data.type === 'work-entries') {
            showWorkEntries(event.data.entries);
        }
    });

    scheduleFrameMeasurements();
}

function initVoCarousels() {
    document.querySelectorAll('.vo-carousel').forEach((carousel) => {
        const track = carousel.querySelector('.vo-carousel__track');
        const prevBtn = carousel.querySelector('.vo-carousel__btn--prev');
        const nextBtn = carousel.querySelector('.vo-carousel__btn--next');
        const dotsContainer = carousel.querySelector('.vo-carousel__dots');

        if (!track || track.children.length === 0) {
            return;
        }

        const slideCount = track.children.length;
        let dots = [];

        if (dotsContainer) {
            dots = Array.from({ length: slideCount }, (_, index) => {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'vo-carousel__dot';
                dot.setAttribute('aria-label', `Go to image ${index + 1}`);
                dot.addEventListener('click', () => {
                    track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
                });
                dotsContainer.append(dot);
                return dot;
            });
        }

        const updateDots = () => {
            const index = Math.round(track.scrollLeft / track.clientWidth);
            dots.forEach((dot, dotIndex) => {
                dot.setAttribute('aria-current', String(dotIndex === index));
            });
        };

        const goToRelativeSlide = (direction) => {
            const index = Math.round(track.scrollLeft / track.clientWidth);
            const nextIndex = Math.max(0, Math.min(slideCount - 1, index + direction));
            track.scrollTo({ left: track.clientWidth * nextIndex, behavior: 'smooth' });
        };

        prevBtn?.addEventListener('click', () => goToRelativeSlide(-1));
        nextBtn?.addEventListener('click', () => goToRelativeSlide(1));
        track.addEventListener('scroll', () => window.requestAnimationFrame(updateDots));

        updateDots();
    });
}

function initVoDetailToggles() {
    document.querySelectorAll('.vo-detail-toggle').forEach((button) => {
        const scope = button.closest('.vo-container') || document;

        button.addEventListener('click', () => {
            const isOn = button.getAttribute('aria-pressed') === 'true';

            scope.querySelectorAll('.vo-detail').forEach((el) => {
                el.hidden = isOn;
            });

            button.setAttribute('aria-pressed', String(!isOn));
            button.textContent = isOn ? 'Show technical detail' : 'Show summary';
            window.notifyFrameResize?.();
        });
    });
}

initVoCarousels();
initVoDetailToggles();

if (window.parent !== window) {
    setupChildFrameSizing();
} else {
    setupParentFrameSizing();
}

