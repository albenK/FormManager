class ValidationRule {
    type: string = '';
    errorMessage: string = '';
    validate: (controlValue: any, form: FormManager) => boolean = () => { return true; };

    constructor(type: string, errorMessage: string, validateFunc: (controlValue: any, form: FormManager) => boolean) {
        this.type = type;
        this.errorMessage = errorMessage;
        this.validate = validateFunc;
    }

    /* 
        We can create custom validation rules with the below static createRule method.
        For example:
        
        export const USERNAME_REQUIRED_RULE = ValidationRule
            .createRule('REQUIRED', 'Username is required.', (value, form) => value.length > 0)

        
        OR we can define another function that returns ValidationRule.createRule().
        This helps for reusability.

        Example:

        export const MIN_LENGTH_RULE = (controlName: string, minCharacters: number) => {
            return ValidationRule.createRule(
                'MIN_LENGTH',
                `${controlName} should contain at least ${minCharacters} characters.`,
                (controlValue, form) => controlValue.length >= minCharacters
            );
        }

        Then call it wherever we like;

        const userNameMinLengthRule = MIN_LENGTH_RULE('Username', 3);
        this.formManager.get('username').validationRules = [userNameMinLengthRule];

        Assuming our form will have a username field.
        This way we don't have to keep calling ValidationRule.createRule() for every
        min length rule.

    */
    static createRule(ruleType: string, errorMessage: string, validateFunc: (controlValue: any, form: FormManager) => boolean): ValidationRule {
        return new ValidationRule(
            ruleType,
            errorMessage,
            validateFunc
        );
    }
}

class FormControlConditionalEvent {
    control: FormControl;
    form: FormManager;
    reason: string;
    constructor() {}
}

class FormControlConditional {
    isShowing: (conditionalEvent: FormControlConditionalEvent) => boolean = () => { return true; };
    dependencies: Array<string> = [];
    constructor(deps: Array<string>, isShowingFunc: (event: FormControlConditionalEvent) => boolean) {
        this.dependencies = deps;
        this.isShowing = isShowingFunc;
    }
}

class FormControl {
    name: string = '';
    value: any = null;
    isValid: boolean = false;
    isTouched: boolean = false;
    errorMessage: string = '';
    validationRules: Array<ValidationRule> = [];
    context: {[key: string]: any} = {};
    conditional: FormControlConditional = new FormControlConditional([],  (event: FormControlConditionalEvent) => { return true; });
    isShowing: boolean = true;
    constructor(name: string, initialValue: any) {
        this.name = name;
        this.value = initialValue;
    }
}


class FormManager {
    private controls: {[key: string]: FormControl} = {};
    private conditionallyRemovedControls: {[key: string]: FormControl} = {};

    addControl(name: string, initialValue: any): FormControl {
        const newControl: FormControl = new FormControl(name, initialValue);
        this.controls[name] = newControl;
        return newControl;
    }

    removeControl(name: string): FormControl {
        const control: FormControl = this.controls[name];
        delete this.controls[name];
        return control;
    }

    isFormValid(): boolean {
        let isValid: boolean = true;

        const names: Array<string> = Object.keys(this.controls);

        for (let i = 0; i < names.length; i++) {
            const name: string = names[i];
            const control: FormControl = this.controls[name];
            if (!control.isValid) {
                isValid = false;
                break;
            }
        }
        return isValid;
    }

    getControls() { // get all visible controls
        return this.controls;
    }

    get(name: string): FormControl { // get control by name.
        return this.controls[name];
    }

    getValues() { // get the form values.
        const formControls: Array<FormControl> = Object.values(this.controls);
        const values: {[name: string]: any} = {};
        formControls.forEach((control: FormControl) => {
            values[control.name] = control.value;
        });
        return values;
    }

    private getValidityOfFormControl(control: FormControl): { isValid: boolean, errorMessage: string } {
        let validityObject = { isValid: true, errorMessage: ''};

        const validationRules: Array<ValidationRule> = control.validationRules || [];
        for (let i = 0; i < validationRules.length; i++) {
            const rule: ValidationRule = validationRules[i];
            const rullPassed: boolean = rule.validate(control.value, this);
            if (!rullPassed) {
                validityObject = { isValid: false, errorMessage: rule.errorMessage};
                break;
            }
        }
        return validityObject;
    }

    runValidations(name: string) {
        if (!this.controls[name]) {
            throw new Error(`${name} form control does not exist.`);
        }
        const control: FormControl = this.controls[name];
        const validityObj = this.getValidityOfFormControl(control);
        control.isValid = validityObj.isValid;
        control.errorMessage = validityObj.errorMessage;
    }

    runConditional(name: string, reasonForRunningConditional: string) {
        if (!this.controls[name] && !this.conditionallyRemovedControls[name]) {
            throw new Error(`${name} form control does not exist.`);
        }
        let controlsObjToUse = this.controls[name] ? this.controls : this.conditionallyRemovedControls;
        const control: FormControl = controlsObjToUse[name];
        const conditionalEvent = new FormControlConditionalEvent();
        conditionalEvent.control = control;
        conditionalEvent.reason = reasonForRunningConditional;
        conditionalEvent.form = this;
        const isShowing: boolean = control.conditional.isShowing(conditionalEvent);
        if (isShowing) {
            this.controls[name] = control;
            delete this.conditionallyRemovedControls[name];
        } else {
            this.conditionallyRemovedControls[name] = control;
            delete this.controls[name];
        }
    }

    onControlValueChange(name: string, newValue: any) { // update control value, isTouched, run validations and any conditional logic.
        if (!this.controls[name]) {
            throw new Error(`${name} form control does not exist.`);
        }
        const control: FormControl = this.controls[name];
        control.isTouched = true;
        const isSameValue: boolean = control.value === newValue;
        /* If the new value is the same as current value, no need to run validations
        or conditionals. */
        if (isSameValue) {
            return;
        }
        control.value = newValue;
        this.runValidations(name);
        /* Run conditional logic for any visible controls that depend on the value of this control.
        They may have to be hidden. */
        const namesOfControls: Array<string> = Object.keys(this.controls);
        const controlsWithDepsOnControl = namesOfControls.filter((n: string) => {
            const c: FormControl = this.controls[n];
            const index: number = c.conditional.dependencies.indexOf(name);
            const hasDependency: boolean = index > -1;
            return hasDependency;
        });

        for (let i = 0; i < controlsWithDepsOnControl.length; i++) {
            const controlName: string = controlsWithDepsOnControl[i];
            this.runConditional(controlName, name);
        }
        // Run conditional logic for removed controls. They may have to be shown again.
        const namesOfRemovedControls: Array<string> = Object.keys(this.conditionallyRemovedControls);
        const controlsWithDeps = namesOfRemovedControls.filter((n: string) => {
            const c: FormControl = this.conditionallyRemovedControls[n];
            const index: number = c.conditional.dependencies.indexOf(name);
            const hasDependency: boolean = index > -1;
            return hasDependency;
        });

        for (let i = 0; i < controlsWithDeps.length; i++) {
            const controlName: string = controlsWithDeps[i];
            this.runConditional(controlName, name);
        }
    }

    onControlBlur(name: string) { // When control has lost focus we can set isTouched to true and run validations.
        if (!this.controls[name]) {
            throw new Error(`${name} form control does not exist.`);
        }
        const control: FormControl = this.controls[name];
        control.isTouched = true;
        this.runValidations(name);
    }
}