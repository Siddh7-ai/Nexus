import { motion, useMotionValue, useReducedMotion, animate } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

const PASSWORD_CHAR = navigator.userAgent.match(/firefox|fxios/i) ? "\u25CF" : "\u2022";

export const SmoothInput = ({
  className,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  type = "text",
  placeholder,
  style,
  ...props
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const isEmail = type === "email";
  const actualType = isEmail ? "text" : type;
  const actualInputMode = isEmail ? "email" : props.inputMode;
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  const isControlled = value !== undefined;
  const inputValue = isControlled ? String(value) : internalValue;

  const prevValueRef = useRef("");
  const prevCaretIndexRef = useRef(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isCaretActive, setIsCaretActive] = useState(false);
  const caretIdleTimeoutRef = useRef(null);
  const activeAnimationRef = useRef(null);
  const prevTargetXRef = useRef(0);

  const cachedStylesRef = useRef(null);
  const updateScheduledRef = useRef(false);

  const getCachedStyles = (input) => {
    if (cachedStylesRef.current) return cachedStylesRef.current;
    if (!input) return null;

    const styles = window.getComputedStyle(input);
    const cached = {
      fontSize: styles.fontSize,
      fontStyle: styles.fontStyle,
      fontWeight: styles.fontWeight,
      fontFamily: styles.fontFamily,
      letterSpacing: styles.letterSpacing,
      fontFeatureSettings: styles.fontFeatureSettings,
      fontVariationSettings: styles.fontVariationSettings,
      textTransform: styles.textTransform,
      paddingLeft: parseFloat(styles.paddingLeft) || 0,
      paddingRight: parseFloat(styles.paddingRight) || 0,
    };
    cachedStylesRef.current = cached;
    return cached;
  };

  const scheduleUpdateCaret = (target) => {
    if (!target) return;
    if (updateScheduledRef.current) return;

    updateScheduledRef.current = true;
    requestAnimationFrame(() => {
      updateScheduledRef.current = false;
      updateCaretRef.current(target);
    });
  };

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = getCachedStyles(input);
    if (!styles) return;
    const isPassword = type === "password";

    let fontSize = styles.fontSize;
    if (
      PASSWORD_CHAR === "\u2022" &&
      isPassword &&
      !navigator.userAgent.match(/chrome|chromium|crios/i)
    ) {
      fontSize = `${parseFloat(fontSize) + 6.25}px`;
    }

    measureSpan.style.fontStyle = styles.fontStyle;
    measureSpan.style.fontWeight = styles.fontWeight;
    measureSpan.style.fontSize = fontSize;
    measureSpan.style.fontFamily = styles.fontFamily;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
    measureSpan.style.textTransform = styles.textTransform;
  };

  const measurePrefixWidth = (text) => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;

    const styles = getCachedStyles(input);
    const paddingLeft = styles ? styles.paddingLeft : 0;

    return text.length > 0
      ? measureSpan.offsetWidth + paddingLeft
      : paddingLeft - 1;
  };

  const scrollCaretIntoView = (target, absoluteWidth) => {
    const styles = getCachedStyles(target);
    if (!styles) return;
    const paddingLeft = styles.paddingLeft;
    const paddingRight = styles.paddingRight;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(
        absoluteWidth - target.clientWidth + paddingRight,
        maxScroll,
      );
      return;
    }

    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  };

  const getSelection = (target) => {
    try {
      return {
        start: target.selectionStart ?? 0,
        end: target.selectionEnd ?? 0,
        direction: target.selectionDirection ?? "forward"
      };
    } catch (e) {
      const savedType = target.type;
      try {
        target.type = "text";
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        const direction = target.selectionDirection ?? "forward";
        target.type = savedType;
        return { start, end, direction };
      } catch (innerError) {
        const len = target.value?.length ?? 0;
        return {
          start: len,
          end: len,
          direction: "forward"
        };
      }
    }
  };

  const updateCaretFromInput = (target) => {
    const { start: selectionStart, end: selectionEnd, direction: selectionDirection } = getSelection(target);
    const hasSelection = selectionStart !== selectionEnd;
    const caretIndex = hasSelection
      ? (selectionDirection === "backward" ? selectionStart : selectionEnd)
      : selectionStart;
    const isPassword = type === "password";
    const textBeforeCaret = isPassword
      ? PASSWORD_CHAR.repeat(caretIndex)
      : target.value.slice(0, caretIndex);

    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;

    scrollCaretIntoView(target, absoluteWidth);

    const styles = getCachedStyles(target);
    if (!styles) return;
    const paddingLeft = styles.paddingLeft;
    const paddingRight = styles.paddingRight;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft - 1;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible =
      caretPosition >= minX && caretPosition <= maxX + 1;

    const targetX = Math.min(caretPosition, maxX);

    const currentValue = target.value;
    const prevValue = prevValueRef.current || "";
    const prevCaretIndex = prevCaretIndexRef.current || 0;
    const prevTargetX = prevTargetXRef.current || 0;

    if (currentValue === prevValue && caretIndex === prevCaretIndex && targetX === prevTargetX && caretOpacity.get() > 0) {
      return;
    }

    prevValueRef.current = currentValue;
    prevCaretIndexRef.current = caretIndex;
    prevTargetXRef.current = targetX;

    const isTyping =
      currentValue.length === prevValue.length + 1 &&
      caretIndex === prevCaretIndex + 1;

    activeAnimationRef.current?.stop();

    if (isTyping && !prefersReducedMotion) {
      activeAnimationRef.current = animate(caretX, targetX, {
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 0.5
      });
    } else {
      caretX.set(targetX);
    }

    setIsCaretActive(true);
    if (caretIdleTimeoutRef.current) clearTimeout(caretIdleTimeoutRef.current);
    caretIdleTimeoutRef.current = setTimeout(() => {
      setIsCaretActive(false);
    }, 500);

    if (!isCaretVisible || hasSelection) {
      caretOpacity.set(0);
      return;
    }

    caretOpacity.set(1);
  };

  const updateCaretRef = useRef(updateCaretFromInput);
  updateCaretRef.current = updateCaretFromInput;
  const caretOpacityRef = useRef(caretOpacity);
  caretOpacityRef.current = caretOpacity;

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      scheduleUpdateCaret(input);
    }
  }, [inputValue]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      cachedStylesRef.current = null;
      scheduleUpdateCaret(input);
    }
  }, [type]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      cachedStylesRef.current = null;
      if (document.activeElement === input) {
        scheduleUpdateCaret(input);
      }
    };

    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;
      scheduleUpdateCaret(input);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.fonts.addEventListener("loadingdone", updateCaretIfFocused);
    void document.fonts.ready.then(updateCaretIfFocused);
    input.addEventListener("scroll", updateCaretIfFocused);

    const resizeObserver = new ResizeObserver(updateCaretIfFocused);
    resizeObserver.observe(container);

    updateCaretIfFocused();

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.fonts.removeEventListener("loadingdone", updateCaretIfFocused);
      input.removeEventListener("scroll", updateCaretIfFocused);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        ...style
      }}
    >
      <input
        {...props}
        ref={inputRef}
        type={actualType}
        inputMode={actualInputMode}
        placeholder={placeholder}
        className={className}
        value={inputValue}
        style={{
          caretColor: "transparent",
          width: "100%"
        }}
        onChange={(e) => {
          if (!isControlled) setInternalValue(e.target.value);
          onChange?.(e);
          scheduleUpdateCaret(e.target);
        }}
        onFocus={(e) => {
          setIsFocused(true);
          setIsCaretActive(false);
          cachedStylesRef.current = null;
          updateCaretRef.current(e.target);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          if (caretIdleTimeoutRef.current) clearTimeout(caretIdleTimeoutRef.current);
          caretOpacityRef.current.set(0);
          onBlur?.(e);
        }}
      />
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "pre",
          opacity: 0,
          zIndex: -100
        }}
      />
      <motion.div
        className={isFocused && !isCaretActive ? "caret-blink" : ""}
        style={{
          x: caretX,
          opacity: caretOpacity,
          position: "absolute",
          pointerEvents: "none",
          width: "2.5px",
          height: "1.25em",
          backgroundColor: "var(--accent, currentColor)",
          left: 0,
          top: "calc(50% - 0.625em)",
          borderRadius: "999px",
          boxShadow: "0 0 8px var(--accent)",
          zIndex: 10
        }}
      />
    </div>
  );
};
