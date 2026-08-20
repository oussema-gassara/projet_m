import logo from "../assets/logo.svg";

export default function Header() {
  return (
    <header className="header">
      <img src={logo} className="header-logo" alt="logo" />
      <hr />
    </header>
  );
}