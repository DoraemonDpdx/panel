/** An error whose message is meant to be shown to the Discord user as is. */
export class UserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UserError';
    }
}
