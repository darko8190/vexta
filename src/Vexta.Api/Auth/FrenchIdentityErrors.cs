using Microsoft.AspNetCore.Identity;

namespace Vexta.Api.Auth;

/// <summary>
/// ASP.NET Identity writes its refusals in English, and they are shown to the person as-is —
/// "Passwords must have at least one digit ('0'-'9')" in the middle of a French application.
/// Every password in Vexta is created through Identity (sign-up, an employee's invitation, a
/// tenant opened by a super admin), so translating here covers all three at once rather than
/// each form guessing at the rules and writing its own copy.
///
/// Only the codes this application can actually reach are overridden. The rest fall through to
/// the base class, which is the right default: an untranslated message beats a wrong one.
/// </summary>
public class FrenchIdentityErrors : IdentityErrorDescriber
{
    public override IdentityError PasswordTooShort(int length) => new()
    {
        Code = nameof(PasswordTooShort),
        Description = $"Le mot de passe doit contenir au moins {length} caractères."
    };

    public override IdentityError PasswordRequiresDigit() => new()
    {
        Code = nameof(PasswordRequiresDigit),
        Description = "Le mot de passe doit contenir au moins un chiffre."
    };

    public override IdentityError PasswordRequiresLower() => new()
    {
        Code = nameof(PasswordRequiresLower),
        Description = "Le mot de passe doit contenir au moins une minuscule."
    };

    public override IdentityError PasswordRequiresUpper() => new()
    {
        Code = nameof(PasswordRequiresUpper),
        Description = "Le mot de passe doit contenir au moins une majuscule."
    };

    public override IdentityError PasswordRequiresNonAlphanumeric() => new()
    {
        Code = nameof(PasswordRequiresNonAlphanumeric),
        Description = "Le mot de passe doit contenir au moins un caractère spécial."
    };

    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => new()
    {
        Code = nameof(PasswordRequiresUniqueChars),
        Description = $"Le mot de passe doit contenir au moins {uniqueChars} caractères différents."
    };

    public override IdentityError PasswordMismatch() => new()
    {
        Code = nameof(PasswordMismatch),
        Description = "Le mot de passe actuel est incorrect."
    };

    // The address is what the person typed, so it is named back to them: "déjà utilisé" without
    // saying which one is useless on a form that holds more than one address.
    public override IdentityError DuplicateEmail(string email) => new()
    {
        Code = nameof(DuplicateEmail),
        Description = $"L'adresse « {email} » est déjà utilisée par un compte."
    };

    public override IdentityError DuplicateUserName(string userName) => new()
    {
        Code = nameof(DuplicateUserName),
        Description = $"L'adresse « {userName} » est déjà utilisée par un compte."
    };

    public override IdentityError InvalidEmail(string? email) => new()
    {
        Code = nameof(InvalidEmail),
        Description = $"L'adresse « {email} » n'est pas une adresse courriel valide."
    };

    public override IdentityError InvalidUserName(string? userName) => new()
    {
        Code = nameof(InvalidUserName),
        Description = $"L'adresse « {userName} » n'est pas une adresse courriel valide."
    };

    public override IdentityError InvalidToken() => new()
    {
        Code = nameof(InvalidToken),
        Description = "Ce lien n'est plus valide. Demandez-en un nouveau."
    };

    public override IdentityError UserAlreadyHasPassword() => new()
    {
        Code = nameof(UserAlreadyHasPassword),
        Description = "Ce compte a déjà un mot de passe."
    };

    public override IdentityError ConcurrencyFailure() => new()
    {
        Code = nameof(ConcurrencyFailure),
        Description = "Ce compte a été modifié entre-temps. Réessayez."
    };

    public override IdentityError DefaultError() => new()
    {
        Code = nameof(DefaultError),
        Description = "La demande a été refusée."
    };
}
