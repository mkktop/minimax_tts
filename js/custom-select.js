/**
 * 自定义下拉框组件
 * 替换原生 select 解决白底问题
 */

class CustomSelect {
    constructor(selectElement, onChange) {
        this.original = selectElement;
        this.onChange = onChange || function() {};
        this.options = [];
        this.selectedValue = '';
        this.isOpen = false;

        // 收集原生 select 的选项
        Array.from(selectElement.options).forEach(opt => {
            this.options.push({
                value: opt.value,
                text: opt.textContent,
                selected: opt.selected
            });
            if (opt.selected) {
                this.selectedValue = opt.value;
            }
        });

        this.render();
        this.attachEvents();
    }

    render() {
        // 创建容器
        this.container = document.createElement('div');
        this.container.className = 'custom-select';

        // 创建触发器
        this.trigger = document.createElement('div');
        this.trigger.className = 'custom-select-trigger';
        this.updateTriggerText();

        // 创建选项面板
        this.optionsPanel = document.createElement('div');
        this.optionsPanel.className = 'custom-select-options';

        this.options.forEach(opt => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option' + (opt.value === this.selectedValue ? ' selected' : '');
            optionEl.textContent = opt.text;
            optionEl.dataset.value = opt.value;
            optionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(opt.value);
            });
            this.optionsPanel.appendChild(optionEl);
        });

        this.container.appendChild(this.trigger);
        this.container.appendChild(this.optionsPanel);

        // 隐藏原生 select
        this.original.classList.add('hidden-native');

        // 插入到原生 select 前面
        this.original.parentNode.insertBefore(this.container, this.original);
    }

    updateTriggerText() {
        const selected = this.options.find(o => o.value === this.selectedValue);
        this.trigger.firstChild
            ? this.trigger.firstChild.textContent = selected ? selected.text : ''
            : (this.trigger.textContent = selected ? selected.text : '');
    }

    select(value) {
        this.selectedValue = value;
        this.original.value = value;

        // 更新触发器文本
        this.trigger.textContent = '';
        const selected = this.options.find(o => o.value === value);
        const text = document.createElement('span');
        text.textContent = selected ? selected.text : '';
        this.trigger.appendChild(text);

        // 更新选项高亮
        Array.from(this.optionsPanel.children).forEach(el => {
            if (el.dataset.value === value) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });

        this.close();
        this.onChange(value);

        // 触发原生 change 事件
        const event = new Event('change', { bubbles: true });
        this.original.dispatchEvent(event);
    }

    open() {
        this.isOpen = true;
        this.trigger.classList.add('open');
        this.optionsPanel.classList.add('open');

        // 滚动到选中项
        const selectedEl = this.optionsPanel.querySelector('.selected');
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    close() {
        this.isOpen = false;
        this.trigger.classList.remove('open');
        this.optionsPanel.classList.remove('open');
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    attachEvents() {
        // 点击触发器
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.close();
            }
        });

        // ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
}

// 初始化所有 select 的辅助函数
function initCustomSelects() {
    document.querySelectorAll('select.form-input').forEach(select => {
        if (!select.classList.contains('hidden-native') && !select.dataset.initialized) {
            select.dataset.initialized = 'true';
            new CustomSelect(select);
        }
    });
}

// DOM Ready 时自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomSelects);
} else {
    initCustomSelects();
}

/**
 * 工厂函数：在指定容器内创建自定义下拉框（不依赖原生 <select>）
 * 供 image.js 等模块以 container + config 方式调用。
 *
 * @param {HTMLElement} container - 容器元素（会被清空后填入下拉框，避免重复调用叠加）
 * @param {Object}   config - { value, options: [{value, label}], onChange(val) }
 * @returns {Object} 实例 API { getValue, setValue, destroy }
 *
 * 渲染结构（供外部读取）：
 *   container > .custom-select > .custom-select-trigger > span.custom-select-value
 * 其中 .custom-select-value 带 data-value 属性（纯 value），textContent 为 label。
 */
window.createCustomSelect = function(container, config) {
    if (!container) return null;
    config = config || {};
    const options = config.options || [];
    let selectedValue = config.value || (options[0] && options[0].value) || '';

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const valueSpan = document.createElement('span');
    valueSpan.className = 'custom-select-value';
    trigger.appendChild(valueSpan);

    const optionsPanel = document.createElement('div');
    optionsPanel.className = 'custom-select-options';

    const labelOf = (val) => {
        const o = options.find(x => x.value === val);
        return o ? (o.label != null ? o.label : o.value) : '';
    };
    const renderTrigger = () => {
        valueSpan.dataset.value = selectedValue;
        valueSpan.textContent = labelOf(selectedValue);
    };

    options.forEach(opt => {
        const optionEl = document.createElement('div');
        optionEl.className = 'custom-select-option' + (opt.value === selectedValue ? ' selected' : '');
        optionEl.textContent = opt.label != null ? opt.label : opt.value;
        optionEl.dataset.value = opt.value;
        optionEl.addEventListener('click', (e) => {
            e.stopPropagation();
            select(opt.value);
        });
        optionsPanel.appendChild(optionEl);
    });

    let isOpen = false;
    const open = () => {
        isOpen = true;
        trigger.classList.add('open');
        optionsPanel.classList.add('open');
        const sel = optionsPanel.querySelector('.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    };
    const close = () => {
        isOpen = false;
        trigger.classList.remove('open');
        optionsPanel.classList.remove('open');
    };

    function select(value) {
        selectedValue = value;
        renderTrigger();
        Array.from(optionsPanel.children).forEach(el => {
            el.classList.toggle('selected', el.dataset.value === value);
        });
        close();
        if (typeof config.onChange === 'function') config.onChange(value);
    }

    trigger.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? close() : open(); });
    document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });

    renderTrigger();
    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsPanel);
    container.appendChild(wrapper);

    return {
        getValue: () => selectedValue,
        setValue: (v) => { if (options.some(o => o.value === v)) select(v); },
        destroy: () => { container.innerHTML = ''; }
    };
};