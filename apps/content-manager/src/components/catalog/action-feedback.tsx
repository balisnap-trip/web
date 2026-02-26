import { Card, CardContent } from "@/components/ui/card";

interface CatalogActionFeedbackProps {
  result?: string;
  error?: string;
}

const resultMessageMap: Record<string, string> = {
  ITEM_CREATED: "Catalog item created successfully.",
  ITEM_UPDATED: "Catalog item updated successfully.",
  CONTENT_UPDATED: "Item content updated successfully.",
  ITEM_DEACTIVATED: "Catalog item deleted successfully.",
  VARIANT_CREATED: "Variant added successfully.",
  VARIANT_UPDATED: "Variant updated successfully.",
  VARIANT_DEACTIVATED: "Variant deactivated successfully.",
  RATE_CREATED: "Rate added successfully.",
  RATE_UPDATED: "Rate updated successfully.",
  RATE_DEACTIVATED: "Rate deactivated successfully.",
  FAILED: "Operation failed. Check error details."
};

const errorMessageMap: Record<string, string> = {
  CM_AUTH_REQUIRED: "Your session is invalid. Please sign in again.",
  CM_ROLE_FORBIDDEN_CATALOG_EDIT: "Your current role is not allowed to edit the catalog.",
  ITEM_ID_REQUIRED: "Item ID is required.",
  ITEM_OR_VARIANT_ID_REQUIRED: "Item ID or Variant ID is invalid.",
  ITEM_OR_RATE_ID_REQUIRED: "Item ID or Rate ID is invalid.",
  ITEM_NAME_REQUIRED: "Item name is required.",
  ITEM_SLUG_REQUIRED: "Item slug is required.",
  STARTER_VARIANT_CODE_REQUIRED: "Starter variant code is required.",
  STARTER_VARIANT_NAME_REQUIRED: "Starter variant name is required.",
  STARTER_VARIANT_PRICE_REQUIRED: "Starter variant price is required.",
  RATE_PRICE_REQUIRED: "Rate price is required.",
  "JSON_REQUIRED:content": "Content payload is required.",
  "JSON_INVALID:content": "Content payload is invalid."
};

function humanizeCode(value: string) {
  return value
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function resolveResultMessage(result?: string) {
  if (!result) {
    return "";
  }
  return resultMessageMap[result] || humanizeCode(result);
}

function resolveErrorMessage(error?: string) {
  if (!error) {
    return "";
  }
  return errorMessageMap[error] || error;
}

export function CatalogActionFeedback({ result, error }: CatalogActionFeedbackProps) {
  if (!result && !error) {
    return null;
  }

  const hasError = Boolean(error) || result === "FAILED";
  const resultMessage = resolveResultMessage(result);
  const errorMessage = resolveErrorMessage(error);

  return (
    <Card className={hasError ? "border-red-200 bg-red-50/80" : "border-emerald-200 bg-emerald-50/80"}>
      <CardContent className="space-y-1 pt-6 text-sm">
        {resultMessage ? (
          <p className={hasError ? "font-medium text-red-700" : "font-medium text-emerald-700"}>{resultMessage}</p>
        ) : null}
        {errorMessage ? <p className="text-red-700">{errorMessage}</p> : null}
      </CardContent>
    </Card>
  );
}
