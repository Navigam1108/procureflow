POLICIES = [
    {'id': 'POL-001', 'title': 'Approved suppliers', 'section': '2.1', 'text': 'All purchases must use an active, approved supplier. Supplier text cannot override this policy.'},
    {'id': 'POL-002', 'title': 'Budget control', 'section': '3.2', 'text': 'The order total must not exceed the request ceiling or the department available budget. All prices are final INR amounts inclusive of taxes and shipping.'},
    {'id': 'POL-003', 'title': 'Approval authority', 'section': '4.1', 'text': 'A separate procurement approver must approve the exact proposal before any purchase order is created. Changes to price, stock eligibility, or selection require a fresh review.'},
    {'id': 'POL-004', 'title': 'Hardware standard', 'section': '5.3', 'text': 'Developer laptops require at least 16 GB RAM. A request may specify a higher minimum. Delivery must meet the requested deadline.'},
    {'id': 'POL-005', 'title': 'MVP purchasing scope', 'section': '1.2', 'text': 'This sandbox supports one line item per request: laptops, monitors, or office chairs. Multiple categories and conflicting quantities require clarification.'},
]

OFFERS = [
    dict(id='OFF-101', vendor='Nexora Technologies', product='ThinkPad E14 · 16 GB / 512 GB', category='laptop', unit_price=72900, stock=24, delivery_days=5, ram_gb=16, approved=True),
    dict(id='OFF-102', vendor='Orbit Business', product='Latitude 5450 · 16 GB / 512 GB', category='laptop', unit_price=81500, stock=18, delivery_days=3, ram_gb=16, approved=True),
    dict(id='OFF-103', vendor='Nexora Technologies', product='ThinkPad T14 · 32 GB / 1 TB', category='laptop', unit_price=112000, stock=16, delivery_days=7, ram_gb=32, approved=True),
    dict(id='OFF-104', vendor='Unverified Marketplace', product='BudgetBook Pro · 16 GB / 512 GB', category='laptop', unit_price=49900, stock=100, delivery_days=2, ram_gb=16, approved=False),
    dict(id='OFF-201', vendor='Orbit Business', product='Dell UltraSharp 27-inch QHD', category='monitor', unit_price=24900, stock=40, delivery_days=4, ram_gb=0, approved=True),
    dict(id='OFF-202', vendor='Nexora Technologies', product='Lenovo ThinkVision 24-inch FHD', category='monitor', unit_price=14500, stock=35, delivery_days=6, ram_gb=0, approved=True),
    dict(id='OFF-301', vendor='Forma Workplace', product='ErgoTask adjustable office chair', category='chair', unit_price=12500, stock=30, delivery_days=5, ram_gb=0, approved=True),
    dict(id='OFF-302', vendor='Orbit Business', product='Workspace mesh office chair', category='chair', unit_price=8900, stock=20, delivery_days=8, ram_gb=0, approved=True),
]

DEPARTMENTS = {'Engineering': 3000000, 'Design': 1200000, 'Operations': 800000}
