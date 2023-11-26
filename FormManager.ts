class ValidationRule {
    type: string = '';
    errorMessage: string = '';
    validate: (formFieldValue: any, form: FormManager) => boolean = () => { return true; };

    constructor(type: string, errorMessage: string, validateFunc: (formFieldValue: any, form: FormManager) => boolean) {
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

class FormFieldConditionalEvent {
    formField: FormField;
    form: FormManager;
    reason: string;
    constructor() {}
}

class FormFieldConditional {
    isShowing: (conditionalEvent: FormFieldConditionalEvent) => boolean = () => { return true; };
    dependencies: Array<string> = [];
    constructor(deps: Array<string>, isShowingFunc: (event: FormFieldConditionalEvent) => boolean) {
        this.dependencies = deps;
        this.isShowing = isShowingFunc;
    }
}

class FormField {
    name: string = '';
    value: any = null;
    isValid: boolean = false;
    isTouched: boolean = false;
    errorMessage: string = '';
    validationRules: Array<ValidationRule> = [];
    context: {[key: string]: any} = {};
    conditional: FormFieldConditional = new FormFieldConditional([],  (event: FormFieldConditionalEvent) => { return true; });
    isShowing: boolean = true;
    constructor(name: string, initialValue: any) {
        this.name = name;
        this.value = initialValue;
    }
}


class FormManager {
    private formFields: {[key: string]: FormField} = {};
    private conditionallyRemovedFormFields: {[key: string]: FormField} = {};

    addFormField(name: string, initialValue: any): FormField {
        const newFormField: FormField = new FormField(name, initialValue);
        this.formFields[name] = newFormField;
        return newFormField;
    }

    removeFormField(name: string): FormField {
        const formField: FormField = this.formFields[name];
        delete this.formFields[name];
        return formField;
    }

    isFormValid(): boolean {
        let isValid: boolean = true;

        const names: Array<string> = Object.keys(this.formFields);

        for (let i = 0; i < names.length; i++) {
            const name: string = names[i];
            const formField: FormField = this.formFields[name];
            if (!formField.isValid) {
                isValid = false;
                break;
            }
        }
        return isValid;
    }

    getVisibleFormFields() { // get all visible form fields.
        return this.formFields;
    }

    getConditionallyRemovedFormFields() {
        return this.conditionallyRemovedFormFields;
    }

    getVisibleFormFieldByName(name: string): FormField { // get form field by name.
        return this.formFields[name];
    }

    getValues() { // get the form values.
        const formFields: Array<FormField> = Object.values(this.formFields);
        const values: {[name: string]: any} = {};
        formFields.forEach((field: FormField) => {
            values[field.name] = field.value;
        });
        return values;
    }

    private getValidityOfFormField(formField: FormField): { isValid: boolean, errorMessage: string } {
        let validityObject = { isValid: true, errorMessage: ''};

        const validationRules: Array<ValidationRule> = formField.validationRules || [];
        for (let i = 0; i < validationRules.length; i++) {
            const rule: ValidationRule = validationRules[i];
            const rullPassed: boolean = rule.validate(formField.value, this);
            if (!rullPassed) {
                validityObject = { isValid: false, errorMessage: rule.errorMessage};
                break;
            }
        }
        return validityObject;
    }

    runValidations(name: string) {
        if (!this.formFields[name]) {
            throw new Error(`${name} form field does not exist.`);
        }
        const control: FormField = this.formFields[name];
        const validityObj = this.getValidityOfFormField(control);
        control.isValid = validityObj.isValid;
        control.errorMessage = validityObj.errorMessage;
    }

    runConditional(name: string, reasonForRunningConditional: string) {
        if (!this.formFields[name] && !this.conditionallyRemovedFormFields[name]) {
            throw new Error(`${name} form field does not exist.`);
        }
        let controlsObjToUse = this.formFields[name] ? this.formFields : this.conditionallyRemovedFormFields;
        const formField: FormField = controlsObjToUse[name];
        const conditionalEvent = new FormFieldConditionalEvent();
        conditionalEvent.formField = formField;
        conditionalEvent.reason = reasonForRunningConditional;
        conditionalEvent.form = this;
        const isShowing: boolean = formField.conditional.isShowing(conditionalEvent);
        if (isShowing) {
            this.formFields[name] = formField;
            delete this.conditionallyRemovedFormFields[name];
        } else {
            this.conditionallyRemovedFormFields[name] = formField;
            delete this.formFields[name];
        }
    }

    updateFormFieldStateOnValueChange(name: string, newValue: any) { // update control value, isTouched, run validations and any conditional logic.
        if (!this.formFields[name]) {
            throw new Error(`${name} form field does not exist.`);
        }
        const formField: FormField = this.formFields[name];
        formField.isTouched = true;
        const isSameValue: boolean = formField.value === newValue;
        /* If the new value is the same as current value, no need to run validations
        or conditionals. */
        if (isSameValue) {
            return;
        }
        formField.value = newValue;
        this.runValidations(name);
        /* Run conditional logic for any visible fields that depend on the value of this field.
        They may have to be hidden. */
        const namesOfFields: Array<string> = Object.keys(this.formFields);
        const fieldsWithDepsOnField = namesOfFields.filter((n: string) => {
            const f: FormField = this.formFields[n];
            const index: number = f.conditional.dependencies.indexOf(name);
            const hasDependency: boolean = index > -1;
            return hasDependency;
        });

        for (let i = 0; i < fieldsWithDepsOnField.length; i++) {
            const fieldName: string = fieldsWithDepsOnField[i];
            this.runConditional(fieldName, name);
        }
        // Run conditional logic for removed fields. They may have to be shown again.
        const namesOfRemovedFields: Array<string> = Object.keys(this.conditionallyRemovedFormFields);
        const fieldsWithDeps = namesOfRemovedFields.filter((n: string) => {
            const c: FormField = this.conditionallyRemovedFormFields[n];
            const index: number = c.conditional.dependencies.indexOf(name);
            const hasDependency: boolean = index > -1;
            return hasDependency;
        });

        for (let i = 0; i < fieldsWithDeps.length; i++) {
            const fieldName: string = fieldsWithDeps[i];
            this.runConditional(fieldName, name);
        }
    }

    updateFormFieldStateOnBlur(name: string) { // When form field has lost focus we can set isTouched to true and run validations.
        if (!this.formFields[name]) {
            throw new Error(`${name} form field does not exist.`);
        }
        const formField: FormField = this.formFields[name];
        formField.isTouched = true;
        this.runValidations(name);
    }
}