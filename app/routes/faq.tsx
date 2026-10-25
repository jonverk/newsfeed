import React from "react";
import HandbookIndex, { loader } from "./handbook-index";

export { loader };

export function meta() {
	return [
		{ title: "Frequently Asked Questions (FAQ) — JonVerk" },
		{ name: "description", content: "Frequently Asked Questions and operational policies for JonVerk." },
	];
}

export default HandbookIndex;
