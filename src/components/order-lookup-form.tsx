"use client";

import { useActionState } from "react";
import { lookupOrder, type LookupState } from "@/app/actions/orders";
import { Button, Card, Field, Input } from "./ui";

export function OrderLookupForm() {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupOrder, undefined);
  return (
    <Card className="mt-8 p-6">
      <form action={action} className="space-y-4">
        <Field label="Order number" htmlFor="order_number">
          <Input id="order_number" name="order_number" required placeholder="ORD-250101-A1B2C3" className="uppercase" autoComplete="off" />
        </Field>
        <Field label="Phone number" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" required placeholder="7XXXXXX" autoComplete="tel" />
        </Field>
        {state?.error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Find my order
        </Button>
      </form>
    </Card>
  );
}
