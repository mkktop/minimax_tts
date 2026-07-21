/**
 * MiniMax Studio 前端交互增强
 * 滚动入场动画、导航栏变化、卡片光效追踪
 */

(function () {
    'use strict';

    // ============ 滚动入场动画 ============
    function initScrollReveal() {
        const revealElements = document.querySelectorAll('.reveal, .reveal-scale, .reveal-left');
        if (!revealElements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('reveal-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.1,
                rootMargin: '0px 0px -60px 0px',
            }
        );

        revealElements.forEach((el) => observer.observe(el));
    }

    // ============ 导航栏滚动变化 ============
    function initHeaderScroll() {
        const header = document.querySelector('.header');
        if (!header) return;

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    if (window.scrollY > 60) {
                        header.classList.add('header-scrolled');
                    } else {
                        header.classList.remove('header-scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // ============ 卡片鼠标光效追踪 ============
    function initCardGlow() {
        const cards = document.querySelectorAll('.module-card, .subhome-card');
        cards.forEach((card) => {
            // 添加光效层
            let glowEl = card.querySelector('.card-glow-effect');
            if (!glowEl) {
                glowEl = document.createElement('div');
                glowEl.className = 'card-glow-effect';
                card.appendChild(glowEl);
            }

            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--mouse-x', x + '%');
                card.style.setProperty('--mouse-y', y + '%');
            }, { passive: true });
        });
    }

    // ============ 数字计数动画 ============
    function initCountUp() {
        const statValues = document.querySelectorAll('.stat-value');
        if (!statValues.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animateValue(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );

        statValues.forEach((el) => observer.observe(el));

        function animateValue(el) {
            const text = el.textContent;
            const match = text.match(/(\d+)/);
            if (!match) return;

            const target = parseInt(match[1]);
            const suffix = text.replace(match[1], '').trim();
            const duration = 1200;
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // easeOutExpo
                const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                const current = Math.round(target * eased);

                // 保留原始 HTML 结构中的 span
                const unitSpan = el.querySelector('.stat-unit');
                if (unitSpan) {
                    el.childNodes[0].textContent = current;
                } else {
                    el.textContent = current + suffix;
                }

                if (progress < 1) {
                    requestAnimationFrame(update);
                }
            }

            requestAnimationFrame(update);
        }
    }

    // ============ 平滑锚点滚动 ============
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                const targetId = anchor.getAttribute('href');
                if (targetId === '#') return;
                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }
            });
        });
    }

    // ============ 移动端导航 ============
    window.toggleNav = function () {
        const nav = document.getElementById('mainNav');
        if (nav) {
            nav.classList.toggle('open');
        }
    };

    // ============ 移动端下拉分组切换（手风琴） ============
    window.toggleNavGroup = function (trigger) {
        // 仅在移动端（下拉不是 hover 触发）时作为手风琴使用
        const group = trigger.closest('.nav-group');
        if (!group) return;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) return;
        // 关闭其他已展开的分组
        document.querySelectorAll('.nav-group.open').forEach((g) => {
            if (g !== group) g.classList.remove('open');
        });
        group.classList.toggle('open');
    };

    // ============ 初始化 ============
    function init() {
        initScrollReveal();
        initHeaderScroll();
        initCardGlow();
        initCountUp();
        initSmoothScroll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
