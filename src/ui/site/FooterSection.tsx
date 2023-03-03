import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../atoms/button/Button";
import { Logo } from "./NavigationBar";
import "./FooterSection.css";
import { Label } from "../atoms/text/Label";
import { Icon } from "../atoms/icon/Icon";
import { Text } from "../atoms/text/Text";
import MatrixLogoSVG from "../../../res/svg/matrix-logo.svg";
import GithubLogoSVG from "../../../res/svg/github-logo.svg";
import TwitterLogoSVG from "../../../res/svg/twitter-logo.svg";
import MastodonLogoSVG from "../../../res/svg/mastodon-logo.svg";
import ArrowForwardIC from "../../../res/ic/arrow-forward.svg";
import { isMobileDevice } from "../utils/common";

function FooterMenu({ children }: { children: ReactNode }) {
  return <div className="flex flex-column gap-sm">{children}</div>;
}

export function FooterSection() {
  const navigate = useNavigate();

  return (
    <footer className="FooterSection flex flex-column items-center">
      <div className="FooterSection__content">
        <div className="FooterSection__branding flex justify-between items-center gap-md">
          <Logo />
          <Button onClick={() => navigate("/login")} disabled={isMobileDevice()}>
            {isMobileDevice() ? "Try on Desktop" : "Get Started"}
            <Icon color="on-primary" src={ArrowForwardIC} />
          </Button>
        </div>
        <div className="flex flex-wrap">
        </div>
        <div className="FooterSection__copyright">
          <Text variant="b2">
            Copyright © Aman.eth •{" "}
            {" "}
            •{" "}
            
            •{" "}
          </Text>
        </div>
      </div>
    </footer>
  );
}
