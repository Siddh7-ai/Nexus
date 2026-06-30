import React, { useState, useRef, useEffect } from "react";
import { FiChevronDown } from "react-icons/fi";

export const CustomSelect = ({ value, onChange, options, disabled, iconMap, colorMap }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleToggle = () => {
        if (!disabled) {
            setIsOpen(!isOpen);
        }
    };

    const handleSelect = (val) => {
        onChange(val);
        setIsOpen(false);
    };

    const selectedOption = options.find(opt => {
        const optVal = typeof opt === 'object' ? opt.value : opt;
        return optVal === value;
    }) || (typeof options[0] === 'object' ? options[0] : { value: options[0], label: options[0] });

    const selectedLabel = typeof selectedOption === 'object' ? selectedOption.label : selectedOption;
    const selectedVal = typeof selectedOption === 'object' ? selectedOption.value : selectedOption;

    return (
        <div className={`custom-select-container ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
            <div className="custom-select-trigger" onClick={handleToggle}>
                <div className="custom-select-trigger-content">
                    {colorMap && colorMap[selectedVal] && (
                        <span 
                            className="custom-select-dot" 
                            style={{ 
                                backgroundColor: colorMap[selectedVal],
                                boxShadow: `0 0 8px ${colorMap[selectedVal]}` 
                            }} 
                        />
                    )}
                    {iconMap && iconMap[selectedVal] && (
                        <span className="custom-select-icon">{iconMap[selectedVal]}</span>
                    )}
                    <span className="custom-select-label">{selectedLabel}</span>
                </div>
                <FiChevronDown className="custom-select-arrow" />
            </div>

            {isOpen && (
                <div className="custom-select-dropdown">
                    {options.map((opt) => {
                        const optVal = typeof opt === 'object' ? opt.value : opt;
                        const optLabel = typeof opt === 'object' ? opt.label : opt;
                        const isSelected = optVal === value;

                        return (
                            <div 
                                key={optVal} 
                                className={`custom-select-option ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => handleSelect(optVal)}
                            >
                                {colorMap && colorMap[optVal] && (
                                    <span 
                                        className="custom-select-dot" 
                                        style={{ 
                                            backgroundColor: colorMap[optVal],
                                            boxShadow: `0 0 6px ${colorMap[optVal]}` 
                                        }} 
                                    />
                                )}
                                {iconMap && iconMap[optVal] && (
                                    <span className="custom-select-icon">{iconMap[optVal]}</span>
                                )}
                                <span className="custom-select-option-label">{optLabel}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
