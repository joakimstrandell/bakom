import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Loader2, MessageSquare, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { submitFeedbackFn } from "../lib/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

type FeedbackModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const submitFeedback = useServerFn(submitFeedbackFn);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");
    setErrorMessage("");

    try {
      await submitFeedback({
        data: {
          message: message.trim(),
          email: email.trim() || undefined,
          name: name.trim() || undefined,
        },
      });

      setStatus("success");
      setMessage("");
      setEmail("");
      setName("");

      // Auto-close after success
      setTimeout(() => {
        onClose();
        setStatus("idle");
      }, 2000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t("feedback.error"));
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      // Reset state after close animation
      setTimeout(() => {
        if (status !== "sending") {
          setStatus("idle");
        }
      }, 200);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-2 space-y-0 pb-4 border-b border-black/5">
          <MessageSquare className="size-5 text-muted-foreground" />
          <DialogTitle>{t("feedback.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pt-4 pb-6 space-y-4">
          {status === "success" ? (
            <div className="text-center py-8">
              <div className="size-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check className="size-6 text-green-600" />
              </div>
              <p className="text-lg font-medium">{t("feedback.success_title")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("feedback.success_message")}</p>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="feedback-message" className="block text-sm font-medium mb-1.5">
                  {t("feedback.message")} <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedback.message_placeholder")}
                  rows={4}
                  required
                  className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="feedback-name" className="block text-sm font-medium mb-1.5">
                    {t("feedback.name")}{" "}
                    <span className="text-muted-foreground">{t("feedback.name_optional")}</span>
                  </label>
                  <input
                    id="feedback-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("feedback.name_placeholder")}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="feedback-email" className="block text-sm font-medium mb-1.5">
                    {t("feedback.email")}{" "}
                    <span className="text-muted-foreground">{t("feedback.email_optional")}</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("feedback.email_placeholder")}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {status === "error" && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {errorMessage}
                </p>
              )}

              <Button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="w-full h-11 rounded-full"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("feedback.sending")}
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    {t("feedback.submit")}
                  </>
                )}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
