 
MARS Internal Requisitions System – Business Requirements Questions
Business Objectives & Scope
1. What business problems is the internal requisitions system expected to solve?
The internal requisitions system is intended to address several operational, financial, and compliance challenges currently experienced across the organisation:
• Lack of visibility and tracking: Manual and email-based processes make it difficult to track requisition status, responsible approvers, and turnaround times.
• Inefficient manual processes: Paper-based and spreadsheet-driven requisitions result in duplication of effort, lost documents, and delays.
• Delayed approval: Absence of automated workflows and reminders causes bottlenecks and impact operational continuity.
• Poor audit trail and compliance challenges: Current processes do not consistently capture approvals, changes, or supporting documents, increasing audit risk.
• Weak budget vs expenditure management: Limited linkage between requisitions, approvals, and budgets reduces effective cost control.
• Communication gaps between departments: Lack of a centralized system leads to misunderstandings between requesting departments, finance, and management.
• Inconsistent documentation and data errors: Non-standard formats and missing information lead to rework; mandatory system fields will improve data quality and completeness.
Overall, the system is expected to improve transparency, accountability, efficiency, and financial control across the organisation.
2. Which departments must use the system at go-live?
All departments will be required to use the internal requisitions system at go-live to ensure a single, standardized process across the organisation.
Requisition Types & Use Cases
3. What types of requisitions must be supported?
The system must support the following types:
• Petty Cash Requisitions: For small, day-to-day operational expenses within approved limits.
• Purchase Order Requisitions: For procurement of goods and services that require supplier engagement and formal purchasing commitments.
• Fuel Requisitions: For allocation, monitoring, and control of fuel usage for company vehicles and operations.
• Travel & Subsistence (T&S) Requisitions: For staff travel, accommodation, meals, and related allowances.
• Asset/Equipment Requisitions: For acquisition of new assets or replacement of existing equipment.
• Maintenance/Repair Requisitions: For servicing or repairs of vehicles, machinery, IT equipment, and facilities.
 
4. Are requisition requirements different per department?
Yes. Requisition requirements vary by department due to differing operational activities, approval thresholds, and documentation needs. The system must therefore:
• Allow department-specific forms and data fields where required.
• Support different approval workflows and limits by department.
• Maintain a standardized core process for consistency and governance.
 
5. What information is mandatory for all requisitions?
The following information must be mandatory for all requisition types:
• Clear description of the item or service requested.
• Business justification for the request.
• Requested amount and estimated total cost.
• Budget line or cost centre and budget availability (where applicable).
• Required approval levels.
• Supplier quotations (where applicable).
• Valid tax clearance certificate.
• VAT certificate (where applicable).
• Any other relevant supporting documentation.
 
6. What are the upper and lower limits for petty cash and other requisitions?
 
• Petty Cash Requisitions: Up to US$200.
• Other Internal Requisitions: Above US$200.
Approval Workflows
7. How many approval levels are required per requisition type?
Requisition Type

Approval Levels

Petty Cash

Initiator → Department Manager → Accountant → Head of Operations & Training

Supplier Payment (Normal)

Initiator → Department Manager → Accountant → General Manager → Financial Controller

High-Value/CAPEX

Initiator → Department Manager → Accountant → General Manager → Financial Controller

 
8. What determines approval routing?
Approval routing is determined by:
• Nature of the requisition (petty cash, operational, CAPEX).
• Monetary value of the request.
• Department-specific approval rules.
 
9. Can approvals be delegated?
Yes. The system must support delegated authority, allowing approvers to formally delegate approval rights in line with organisational policy, with full audit visibility.
Notifications
10. Who receives notifications at each stage?
Stage

Notification Recipients

Requisition submission

Originator

Manager approval

Approver and Originator

Finance review

Finance team and Originator

Senior approval

Financial Controller and Originator

Payment processing

Finance team

Payment completion

Finance team and Originator

 
11. What notification channels are required?
• System (in-app) notifications
• Email notifications
• Automated audit trail logging
Tracking & Status
12. What requisition statuses must be supported?
• Draft
• Submitted
• Pending Review
• Pending Approval
• Approved
• Pending Payment
• Paid
• Rejected
• Cancelled
 
13. Should users view real-time status?
Yes. Users should be able to view:
• Current requisition status
• Timestamp for each status change
• Current approver responsible
• Comments, queries, and responses logged within the system.
 
14. What visibility rules apply per role?
Role

Access & Visibility

Restrictions

Requester

Own requisitions, comments, proof of payment

Cannot view others’ requisitions or internal finance notes

Approver

Requisitions awaiting approval and team submissions

No access to finance-only notes

Finance

All requisitions and financial data

Restricted access to confidential requests

Finance Management

Full system visibility

Subject only to policy-defined restrictions

System Administrator

System configuration and settings

Limited or no access to financial data

Auditor

Full read-only access

Cannot edit any records

 
Audit Trail & Compliance
15. What actions must be logged?
• Creation, edits, and submissions of requisitions
• All approvals and rejections
• Delegation of approval authority
• Attachments and document uploads
 
16. Is timestamping required for every action?
Yes. All actions must be automatically timestamped.
17. Should audit logs be immutable?
No. Audit logs do not need to be immutable, but access must be restricted and changes traceable.
18. Who can access audit logs?
• Financial Controller
• Authorized audit and compliance personnel
Purchase Orders
19. When should Purchase Orders be generated?
A Purchase Order (PO) must be generated:
• After full internal approval of a requisition
• Before any purchase commitment is made
• Before goods or services are delivered
Exceptions: Statutory payments, payroll-related expenses, and Travel & Subsistence allowances.
20. What information must appear on a Purchase Order?
 
• PO Identification: PO number, PO date, version/revision number
• Buyer Details: Company name, address, requesting department, contact person.
• Supplier Details: Supplier name, address, contact person, email, phone.
• Item Details: Description, quantity, unit of measure, unit price, line total
• Financial Information: Currency, subtotal, total order value
• Requester Details: Name of requester
• Approvals: Approver names and electronic approval references
Reporting
21. Which KPIs must be tracked?
• Requisition turnaround time.
• Approval and payment backlog volume.
• Number of Purchase Orders raised.
• Purchase Order compliance rate (PO raised before invoice receipt).
 
22. Should reports be exportable?
Yes. Reports must be exportable in common formats (e.g. Excel, PDF).
23. Who can access dashboards?
Dashboards should be accessible only to authorized users based on role, including:
• Senior management
• Department heads
• Finance teams
• Auditors
• System administrators
Access must be strictly controlled through role-based permissions.